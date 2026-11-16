// A stand-in for the `vscode` module in the unit tests: vitest.config.mts aliases `vscode` to this file, so the host
// modules that import it load outside the editor. It has only the slice of the API the host uses, records what the
// host did (messages shown, commands registered, webviews and what was posted to them) and lets a test answer the
// questions. One instance for the whole run: call `fake.reset()` before each test.
import { rmSync, statSync } from 'node:fs';
import { posix } from 'node:path';

type Listener<T> = (event: T) => unknown;

export class Disposable {
  constructor(private readonly callOnDispose: () => void = () => undefined) {}
  static from(...items: { dispose(): unknown }[]): Disposable {
    return new Disposable(() => {
      for (const i of items) i.dispose();
    });
  }
  dispose(): void {
    this.callOnDispose();
  }
}

export class EventEmitter<T> {
  private listeners: Listener<T>[] = [];
  readonly event = (listener: Listener<T>, thisArg?: unknown, disposables?: Disposable[]): Disposable => {
    const bound: Listener<T> = (e) => listener.call(thisArg, e);
    this.listeners.push(bound);
    const d = new Disposable(() => {
      this.listeners = this.listeners.filter((l) => l !== bound);
    });
    disposables?.push(d);
    return d;
  };
  fire(event: T): void {
    for (const l of [...this.listeners]) l(event);
  }
  dispose(): void {
    this.listeners = [];
  }
}

interface UriParts {
  scheme?: string;
  authority?: string;
  path?: string;
  query?: string;
  fragment?: string;
}

export class Uri {
  readonly scheme: string;
  readonly authority: string;
  readonly path: string;
  readonly query: string;
  readonly fragment: string;
  private constructor(parts: UriParts) {
    this.scheme = parts.scheme ?? 'file';
    this.authority = parts.authority ?? '';
    this.path = parts.path ?? '';
    this.query = parts.query ?? '';
    this.fragment = parts.fragment ?? '';
  }
  get fsPath(): string {
    return this.path;
  }
  static file(path: string): Uri {
    return new Uri({ scheme: 'file', path });
  }
  static from(parts: UriParts): Uri {
    return new Uri(parts);
  }
  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri({ ...base, path: posix.join(base.path, ...segments) });
  }
  with(change: UriParts): Uri {
    return new Uri({ ...this, ...change });
  }
  toString(): string {
    const query = this.query ? `?${this.query}` : '';
    return `${this.scheme}://${this.authority}${this.path}${query}`;
  }
}

export class RelativePattern {
  constructor(
    readonly base: unknown,
    readonly pattern: string,
  ) {}
}

export const ViewColumn = { Active: -1, Beside: -2, One: 1, Two: 2 } as const;
export const ProgressLocation = { SourceControl: 1, Window: 10, Notification: 15 } as const;
export const ExtensionMode = { Production: 1, Development: 2, Test: 3 } as const;

/** A webview: records the HTML and what the host posted, and delivers messages "from the page" with `receive`. */
export class FakeWebview {
  html = '';
  options: unknown = {};
  readonly cspSource = 'fake-csp';
  readonly posted: unknown[] = [];
  /** What `postMessage` answers: `false` is a page that did not take it. */
  delivers = true;
  private readonly received = new EventEmitter<unknown>();
  readonly onDidReceiveMessage = this.received.event;
  asWebviewUri(uri: Uri): Uri {
    return uri.with({ scheme: 'fake-webview' });
  }
  postMessage(message: unknown): Promise<boolean> {
    if (this.delivers) this.posted.push(message);
    return Promise.resolve(this.delivers);
  }
  /** A message from the page to the host. */
  receive(message: unknown): void {
    this.received.fire(message);
  }
  /** The `type` of each message posted, in order. */
  types(): unknown[] {
    return this.posted.map((m) => (typeof m === 'object' && m !== null && 'type' in m ? m.type : m));
  }
}

/** The sidebar view (`WebviewView`). */
export class FakeWebviewView {
  readonly webview = new FakeWebview();
  visible = true;
  private readonly visibility = new EventEmitter<void>();
  private readonly disposal = new EventEmitter<void>();
  readonly onDidChangeVisibility = this.visibility.event;
  readonly onDidDispose = this.disposal.event;
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.visibility.fire();
  }
  dispose(): void {
    this.visible = false;
    this.disposal.fire();
  }
}

/** An editor tab with a webview (`WebviewPanel`). */
export class FakeWebviewPanel {
  readonly webview = new FakeWebview();
  visible = true;
  iconPath: unknown;
  revealed = 0;
  disposed = false;
  private readonly viewState = new EventEmitter<void>();
  private readonly disposal = new EventEmitter<void>();
  readonly onDidChangeViewState = this.viewState.event;
  readonly onDidDispose = this.disposal.event;
  constructor(
    readonly viewType: string,
    readonly title: string,
  ) {}
  reveal(): void {
    this.revealed++;
  }
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.viewState.fire();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposal.fire();
  }
}

/** A message the host showed: its severity, text, options and the items offered. */
export interface Shown {
  severity: 'info' | 'warning' | 'error';
  text: string;
  options: unknown;
  items: unknown[];
}

/** The output channel: every line, with its level. */
export class FakeChannel {
  readonly lines: { level: 'info' | 'warn' | 'error'; text: string }[] = [];
  constructor(readonly name: string) {}
  info(text: string): void {
    this.lines.push({ level: 'info', text });
  }
  warn(text: string): void {
    this.lines.push({ level: 'warn', text });
  }
  error(text: string): void {
    this.lines.push({ level: 'error', text });
  }
  dispose(): void {}
  /** The text of every line, or only of one level. */
  texts(level?: 'info' | 'warn' | 'error'): string[] {
    return this.lines.filter((l) => level === undefined || l.level === level).map((l) => l.text);
  }
}

export class FakeWatcher {
  readonly created = new EventEmitter<Uri>();
  readonly changed = new EventEmitter<Uri>();
  readonly deleted = new EventEmitter<Uri>();
  readonly onDidCreate = this.created.event;
  readonly onDidChange = this.changed.event;
  readonly onDidDelete = this.deleted.event;
  disposed = false;
  constructor(readonly pattern: RelativePattern) {}
  dispose(): void {
    this.disposed = true;
  }
}

type Command = (...args: unknown[]) => unknown;

function freshState() {
  return {
    /** Every message shown, in order. */
    shown: [] as Shown[],
    /**
     * Answers the next message (a modal, a notification with buttons): receives what was shown and returns the item
     * chosen, or `undefined` (closed). By default nothing is chosen.
     */
    answer: (_shown: Shown): unknown => undefined,
    /** Answers `showQuickPick`; by default nothing is chosen. */
    pick: (_items: readonly unknown[]): unknown => undefined,
    /** The options of each `showQuickPick` (title, placeholder), in order. */
    picks: [] as unknown[],
    /** The titles of the `withProgress` calls (the location's `viewId` for a view's bar). */
    progress: [] as unknown[],
    channels: [] as FakeChannel[],
    clipboard: '',
    /** The URIs given to `env.openExternal`. */
    opened: [] as Uri[],
    /** The files opened in an editor (`window.showTextDocument`). */
    documents: [] as Uri[],
    commands: new Map<string, Command>(),
    /** The commands executed that the host did not register (VS Code's or another extension's). */
    executed: [] as { command: string; args: unknown[] }[],
    /** What `commands.getCommands` lists besides the registered ones. */
    builtInCommands: [] as string[],
    viewProviders: new Map<string, { resolveWebviewView(view: FakeWebviewView): unknown }>(),
    panels: [] as FakeWebviewPanel[],
    watchers: [] as FakeWatcher[],
    /** The settings by full key (`planRelay.refreshIntervalMinutes`). */
    settings: new Map<string, unknown>(),
    extensions: new Map<string, { id: string; extensionPath: string }>(),
    workspaceFolders: undefined as { uri: Uri; name: string; index: number }[] | undefined,
    textDocuments: [] as { uri: Uri; isDirty: boolean }[],
    activeTextEditor: undefined as { document: { uri: Uri } } | undefined,
    language: 'en',
    trusted: true,
    folderChange: new EventEmitter<unknown>(),
    configurationChange: new EventEmitter<{ affectsConfiguration(section: string): boolean }>(),
  };
}

/** What the fake recorded and how it answers; `reset()` starts over. */
export const fake = {
  ...freshState(),
  reset(): void {
    Object.assign(fake, freshState());
  },
  /** Opens these folders as the workspace. */
  openFolders(...paths: string[]): void {
    fake.workspaceFolders = paths.map((p, index) => ({ uri: Uri.file(p), name: posix.basename(p), index }));
  },
  /** Resolves the registered webview view, as VS Code does when the sidebar shows it. */
  resolveView(id: string): FakeWebviewView {
    const provider = fake.viewProviders.get(id);
    if (!provider) throw new Error(`no provider registered for ${id}`);
    const view = new FakeWebviewView();
    provider.resolveWebviewView(view);
    return view;
  },
  /** Runs a command the host registered. */
  run(command: string, ...args: unknown[]): unknown {
    const fn = fake.commands.get(command);
    if (!fn) throw new Error(`command not registered: ${command}`);
    return fn(...args);
  },
  /** The last channel created (the host creates one). */
  channel(): FakeChannel {
    const c = fake.channels.at(-1);
    if (!c) throw new Error('no output channel created');
    return c;
  },
};

function show(severity: Shown['severity']) {
  return (text: string, ...rest: unknown[]): Promise<unknown> => {
    const [first, ...others] = rest;
    const hasOptions = typeof first === 'object' && first !== null && !('title' in first);
    const shown: Shown = { severity, text, options: hasOptions ? first : undefined, items: hasOptions ? others : rest };
    fake.shown.push(shown);
    return Promise.resolve(fake.answer(shown));
  };
}

export const window = {
  showInformationMessage: show('info'),
  showWarningMessage: show('warning'),
  showErrorMessage: show('error'),
  showQuickPick: (items: readonly unknown[], options?: unknown): Promise<unknown> => {
    fake.picks.push(options);
    return Promise.resolve(fake.pick(items));
  },
  showTextDocument: (uri: Uri): Promise<unknown> => {
    fake.documents.push(uri);
    return Promise.resolve(undefined);
  },
  withProgress: <R>(options: { location: unknown; title?: string }, task: (progress: { report(): void }) => Thenable<R>): Thenable<R> => {
    fake.progress.push(options.title ?? options.location);
    return task({ report: () => undefined });
  },
  createOutputChannel: (name: string): FakeChannel => {
    const channel = new FakeChannel(name);
    fake.channels.push(channel);
    return channel;
  },
  createWebviewPanel: (viewType: string, title: string): FakeWebviewPanel => {
    const panel = new FakeWebviewPanel(viewType, title);
    fake.panels.push(panel);
    return panel;
  },
  registerWebviewViewProvider: (id: string, provider: { resolveWebviewView(view: FakeWebviewView): unknown }): Disposable => {
    fake.viewProviders.set(id, provider);
    return new Disposable(() => fake.viewProviders.delete(id));
  },
  get activeTextEditor() {
    return fake.activeTextEditor;
  },
};

export const commands = {
  registerCommand: (command: string, fn: Command): Disposable => {
    fake.commands.set(command, fn);
    return new Disposable(() => fake.commands.delete(command));
  },
  executeCommand: (command: string, ...args: unknown[]): Promise<unknown> => {
    const fn = fake.commands.get(command);
    if (fn) return Promise.resolve(fn(...args));
    fake.executed.push({ command, args });
    return Promise.resolve(undefined);
  },
  getCommands: (): Promise<string[]> => Promise.resolve([...fake.builtInCommands, ...fake.commands.keys()]),
};

export const workspace = {
  get workspaceFolders() {
    return fake.workspaceFolders;
  },
  get textDocuments() {
    return fake.textDocuments;
  },
  get isTrusted() {
    return fake.trusted;
  },
  getConfiguration: (section?: string) => ({
    get: <T>(key: string, fallback?: T): T | undefined => {
      const full = section ? `${section}.${key}` : key;
      return fake.settings.has(full) ? (fake.settings.get(full) as T) : fallback;
    },
  }),
  onDidChangeWorkspaceFolders: (listener: Listener<unknown>) => fake.folderChange.event(listener),
  onDidChangeConfiguration: (listener: Listener<{ affectsConfiguration(section: string): boolean }>) =>
    fake.configurationChange.event(listener),
  createFileSystemWatcher: (pattern: RelativePattern): FakeWatcher => {
    const watcher = new FakeWatcher(pattern);
    fake.watchers.push(watcher);
    return watcher;
  },
  /** The real disk: the host reads and deletes plans in the tests' temporary folders. */
  fs: {
    stat: (uri: Uri): Promise<{ type: number }> => {
      try {
        return Promise.resolve({ type: statSync(uri.fsPath).isDirectory() ? 2 : 1 });
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
    delete: (uri: Uri, options?: { recursive?: boolean }): Promise<void> => {
      rmSync(uri.fsPath, { recursive: options?.recursive ?? false, force: false });
      return Promise.resolve();
    },
  },
};

export const env = {
  get language() {
    return fake.language;
  },
  clipboard: {
    writeText: (text: string): Promise<void> => {
      fake.clipboard = text;
      return Promise.resolve();
    },
    readText: (): Promise<string> => Promise.resolve(fake.clipboard),
  },
  openExternal: (uri: Uri): Promise<boolean> => {
    fake.opened.push(uri);
    return Promise.resolve(true);
  },
};

export const extensions = {
  getExtension: (id: string) => fake.extensions.get(id),
};

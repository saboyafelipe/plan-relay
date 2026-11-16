// The panel view and the reading of the plans. What belongs to the agent (plugin state, install) is in `AgentWiring`;
// the actions of the buttons and commands, in `PanelActions`. The page lives in the sidebar view and, in a window
// without extension views (the Agents window) or when opened by command, in an editor panel; every open one is a
// `Surface` and receives the same messages. Its dependencies come from `activate`: nothing here is created on import.
import * as vscode from 'vscode';
import type { Strings } from '@plan-relay/i18n';
import {
  IDEA_ACTIONS,
  ideasView,
  isWebviewMessage,
  planView,
  statusText,
  type WebviewMessage,
  type HostMessage,
  type PluginView,
} from '@plan-relay/panel';
import { discoverIdeas, type DiscoveredIdea, type Environment } from '@plan-relay/reader';
import { nodeEnvironment, nodeFiles } from '@plan-relay/reader/node';
import { PanelActions } from './actions/panel';
import { confirmInTab } from './actions/confirmation';
import { AgentWiring, VIEW } from './agent';
import type { Provider } from './agents/provider';
import { inChannel } from './channel';
import { errorMessage } from './util';
import { readEnvironment, environmentLines } from './environment';
import { outdatedExtensionNotice, type ExtensionIdentity } from './extension-version';
import { hourMinute } from './format/time';
import { alertEvents, type AlertActions, type Alerter } from './notify/alert';
import { eventsBetween, eventLine } from './notify/events';
import { panelHtml } from './panel';
import { load, type LoadedPlan } from './plans/load';
import { readPluginOnLoad, type RefreshReason } from './refresh/schedule';
import { refreshLines } from './refresh/log-lines';
import { createEditorPanel, revealPanel, editorSurface, type Surface } from './surface';
import type { WebviewProbe } from './webview-probe';

export type HostChannel = Pick<vscode.LogOutputChannel, 'info' | 'warn' | 'error'>;

/** What `activate` builds once and hands to the host's parts. */
export interface HostDeps {
  /** The strings in the VS Code language. */
  strings: Strings;
  channel: HostChannel;
  alerter: Alerter;
  /** Plays the alert sound; never waits nor throws. */
  playSound(): void;
  /** Only in Test mode: lets the integration tests stand in for the pages (webview-probe.ts). */
  probe?: WebviewProbe;
}

/** The schedule's hooks into the panel view: request a load and report whether the page is visible. */
export interface ScheduleWiring {
  request(reason: RefreshReason): void;
  visible(visible: boolean): void;
}

interface Reading {
  plans: LoadedPlan[];
  ideas: DiscoveredIdea[];
  when: Date;
}

export class PanelView implements vscode.WebviewViewProvider {
  /** Every open page: the sidebar view and the editor panel may be open at the same time. */
  private readonly views = new Set<Surface>();
  /** The open editor panel. */
  private editor: vscode.WebviewPanel | undefined;
  /** The last reveal did not find the container: the view's progress bar has nowhere to appear. */
  private withoutContainer = false;
  private ongoing: Promise<void> | undefined;
  private last: Reading | undefined;
  private toLoad = false;
  /** Not yet read since startup, or an agent setting (or the folders) changed since the last load. */
  private markedPlugin = true;
  /** The last environment check, for the page that reappears. */
  private environment: Environment | undefined;
  /** The notices at the top, for the page that reappears. */
  private notices: string[] = [];
  readonly agent: AgentWiring;
  readonly actions: PanelActions;
  private readonly strings: Strings;
  private readonly channel: HostChannel;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly schedule: ScheduleWiring,
    provider: Provider,
    /** The `package.json` of the running extension, to compare with the one in the open repository. */
    private readonly own: ExtensionIdentity,
    private readonly deps: HostDeps,
  ) {
    this.strings = deps.strings;
    this.channel = deps.channel;
    this.agent = new AgentWiring(provider, this.channel, (plugin) => this.sendPlugin(plugin), this.strings);
    this.actions = new PanelActions(
      this.agent,
      {
        plans: () => this.last?.plans ?? [],
        ideas: () => this.last?.ideas ?? [],
        requestLoad: () => this.schedule.request('file'),
        reveal: async () => void (await this.reveal()),
        confirmInTab: (data) => confirmInTab(this.extensionUri, data, this.strings, deps.probe),
      },
      this.channel,
      this.strings,
    );
  }

  /**
   * Returns while loading the plans; when done, writes them to the output channel and sends them to the pages. Never
   * rejects. Only the schedule calls it. While loading, the view shows the VS Code progress bar and the webview
   * disables "Refresh".
   */
  refresh(reason: RefreshReason): Promise<void> {
    const { channel, strings } = this;
    const folders = (vscode.workspace.workspaceFolders ?? []).map((p) => p.uri.fsPath);
    // The plugin is read alongside the plans and sent when it arrives: it does not delay the cards. On loads
    // triggered by plan files the last state read stays, unless the agent settings changed in the meantime.
    const readsPlugin = readPluginOnLoad(reason, this.markedPlugin);
    if (readsPlugin) this.markedPlugin = false;
    const plugin = readsPlugin ? this.agent.read() : Promise.resolve();
    // The environment is re-read on the plugin's schedule (its state feeds the checks) and does not hold the
    // progress bar: the agent's `auth status` takes its own time.
    if (readsPlugin) void plugin.then(() => this.readEnvironment());
    // The version in the open repository changes with a checkout or a pull: re-read on the same schedule.
    if (readsPlugin) void this.readAlertSettings();
    // The ideas are read with the plans; `discoverIdeas` never rejects (an unreadable idea becomes `invalid`).
    const plans = Promise.all([load(folders), discoverIdeas(nodeFiles, folders)]).then(
      ([plans, ideas]) => {
        if (this.ongoing !== ongoing) return;
        // The events come from the previous load against the new one; the first of the session yields none.
        const previous = this.last?.plans;
        this.last = { plans, ideas, when: new Date() };
        for (const l of refreshLines(reason, plans, strings)) channel[l.tier](l.text);
        const events = eventsBetween(previous, plans);
        for (const e of events) channel.info(eventLine(e, strings));
        // The settings are read here, on every load: changing one applies on the next event, without reloading the window.
        alertEvents(
          events,
          vscode.workspace.getConfiguration('planRelay.notifications'),
          strings,
          this.deps.alerter,
          this.alertActions(),
          () => this.deps.playSound(),
        );
        this.send();
      },
      (error: unknown) => channel.error(strings.t('log.readFailed', errorMessage(error))),
    );
    const ongoing = Promise.all([plans, plugin]).then(() => undefined);
    this.ongoing = ongoing;
    this.setLoading(true);
    const finished = ongoing.finally(() => {
      if (this.ongoing === ongoing) this.setLoading(false);
    });
    if (this.withoutContainer) return finished;
    return Promise.resolve(vscode.window.withProgress({ location: { viewId: VIEW } }, () => finished));
  }

  /** The buttons of the alerts that need you: the actions the panel already has, without going through the webview. */
  private alertActions(): AlertActions {
    return {
      continueRun: (folder) => void this.actions.run(folder),
      openTask: (folder, id) => {
        const plan = this.last?.plans.find((p) => p.folder === folder);
        const task = plan && 'status' in plan ? plan.status.tasks.find((t) => t.id === id) : undefined;
        if (task) void this.actions.openItem(folder, task.file);
      },
      openPanel: () => void this.reveal(),
    };
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.bind(view);
  }

  /**
   * Reveals the page: the sidebar container or, in a window that lacks it, the editor panel (open or new).
   */
  async reveal(): Promise<'container' | 'editor'> {
    const path = await revealPanel({
      commandList: () => vscode.commands.getCommands(true),
      execute: (command) => vscode.commands.executeCommand(command),
      isOpen: () => this.editor,
      create: () => this.openEditor(),
    });
    this.withoutContainer = path === 'editor';
    return path;
  }

  private openEditor(): void {
    const editor = createEditorPanel(vscode.window, 'Plan Relay', vscode.ViewColumn.Active, this.roots());
    editor.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'icon.png');
    this.editor = editor;
    editor.onDidDispose(() => {
      if (this.editor === editor) this.editor = undefined;
    });
    this.bind(editorSurface(editor));
  }

  /** The extension folders the page may load from. */
  private roots(): vscode.Uri[] {
    return [vscode.Uri.joinPath(this.extensionUri, 'dist'), vscode.Uri.joinPath(this.extensionUri, 'media')];
  }

  /** Whether any open page is visible: the schedule waits while none is. */
  private anyVisible(): boolean {
    return [...this.views].some((v) => v.visible);
  }

  /** Binds a page (the view or the editor panel): the HTML, the messages and the visibility the schedule expects. */
  private bind(view: Surface): void {
    const { channel, strings } = this;
    this.views.add(view);
    view.webview.options = { enableScripts: true, localResourceRoots: this.roots() };
    view.webview.html = panelHtml(view.webview, this.extensionUri, vscode.Uri, strings);
    // Never rejects: a refused message or a failed action becomes a line in the output channel.
    const receive = async (message: unknown): Promise<void> => {
      if (!isWebviewMessage(message)) {
        channel.warn(strings.t('log.messageRefused', JSON.stringify(message)?.slice(0, 200) ?? ''));
        return;
      }
      await this.handle(message, view).catch((error: unknown) =>
        channel.error(strings.t('log.webviewFailed', inChannel(message.type, strings), errorMessage(error))),
      );
    };
    view.webview.onDidReceiveMessage((message: unknown) => void receive(message));
    this.deps.probe?.panelBound(receive);
    view.onDidChangeVisibility(() => {
      if (this.views.has(view)) this.schedule.visible(this.anyVisible());
    });
    view.onDidDispose(() => {
      if (!this.views.delete(view)) return;
      this.schedule.visible(this.anyVisible());
    });
    channel.info(strings.t('log.viewResolved'));
    this.schedule.visible(this.anyVisible());
  }

  /** Handles a message from the page `from`; the replies to `ready` go to that page only. */
  private async handle(message: WebviewMessage, from: Surface): Promise<void> {
    this.channel.info(`webview: ${inChannel(message.type, this.strings)}`);
    switch (message.type) {
      case 'ready': {
        // With no finished load, the one in progress (or a new one) sends when it finishes.
        if (this.last) this.send(from);
        else if (!this.ongoing) this.schedule.request('ready');
        // These posts are best effort (the page asks again with the next `ready`), hence `void`.
        if (this.toLoad) void this.post({ type: 'loading', active: true }, from);
        const plugin = this.agent.status();
        if (plugin) void this.post({ type: 'plugin', plugin }, from);
        if (this.environment) void this.post({ type: 'environment', environment: this.environment }, from);
        // Always, even when empty: the page may have kept a notice that no longer applies.
        void this.post({ type: 'notices', notices: this.notices }, from);
        return;
      }
      case 'install':
        await this.agent.install();
        return;
      case 'refresh':
        // Mark now: the debounce keeps only the last reason, and a "file" reason right after would not re-read the plugin.
        this.markPlugin();
        this.schedule.request('button');
        return;
      case 'open':
        await this.actions.openItem(message.plan, message.file);
        return;
      case 'delete':
        await this.actions.remove(message.plan);
        return;
      case 'execute':
        await this.actions.execute(message.plan, message.id);
        return;
      case 'giveUp':
        await this.actions.giveUp(message.plan, message.id);
        return;
      case 'reopen':
        await this.actions.reopen(message.plan, message.id);
        return;
      case 'run':
        await this.actions.run(message.plan);
        return;
      case 'copy':
        await this.actions.copy(message.plan, message.id);
        return;
      case 'ideaRefine':
        await this.actions.refineIdea(message.idea);
        return;
      case 'ideaMap':
        await this.actions.createTasksFromIdea(message.idea);
        return;
      case 'ideaOpen':
        await this.actions.openIdea(message.idea);
        return;
      case 'ideaNew':
        await this.actions.newIdea();
        return;
      case 'ideaFolder':
        await this.actions.openIdeasFolder();
        return;
      case 'tab':
        // "Collapse all" in the title bar only shows with Plans active (`when` in package.json).
        await vscode.commands.executeCommand('setContext', 'planRelay.tab', message.tab);
        return;
    }
  }

  /** The next load re-reads the plugin, even if it comes from a plan file. */
  markPlugin(): void {
    this.markedPlugin = true;
  }

  /** Checks the environment, writes the detail to the output channel and sends the list to the pages (the footer). Never rejects. */
  private async readEnvironment(): Promise<void> {
    const { channel, strings } = this;
    try {
      const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const environment = await readEnvironment(this.agent.provider, folder, this.agent.status(), {
        ...nodeEnvironment(),
        strings,
      });
      this.environment = environment;
      for (const l of environmentLines(environment, strings)) channel[l.tier](l.text);
      const delivered = await this.post({ type: 'environment', environment });
      if (delivered) channel.info(strings.t('log.environmentSent', String(environment.ok)));
    } catch (error) {
      channel.error(strings.t('log.environmentFailed', errorMessage(error)));
    }
  }

  /** The installed extension against the one in the open repository: the notice goes to the top and the output channel. Never rejects. */
  private async readAlertSettings(): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const notice = await outdatedExtensionNotice(folder, this.own, this.strings);
    if (notice) this.channel.warn(notice);
    const notices = notice ? [notice] : [];
    if (notices.length === 0 && this.notices.length === 0) return;
    this.notices = notices;
    void this.post({ type: 'notices', notices });
  }

  private sendPlugin(plugin: PluginView): void {
    void this.post({ type: 'plugin', plugin }).then((delivered) => {
      if (delivered) this.channel.info(this.strings.t('log.pluginSent', inChannel(plugin.state, this.strings)));
    });
  }

  /** Sends the last reading to every page, or only to `to`. */
  private send(to?: Surface): void {
    const reading = this.last;
    if (!reading) return;
    const plans = reading.plans.map((p) => planView(p, new Date(), this.strings));
    // This host handles the three idea actions; one it did not handle would be dropped from the list and the panel would not show the button.
    const ideas = ideasView(reading.ideas, IDEA_ACTIONS);
    void this.post({ type: 'status', plans, updated: hourMinute(reading.when), ideas }, to).then((delivered) => {
      if (delivered) this.channel.info(this.strings.t('log.plansSent', plans.length));
    });
  }

  /** "Collapse all" in the title bar: the page closes the phases of every plan. */
  collapseAll(): void {
    void this.post({ type: 'collapseAll' });
  }

  /** "Filter" in the title bar and the shortcut: the page moves focus to the search field. */
  filter(): void {
    void this.post({ type: 'filter' });
  }

  /**
   * The plugin state and the time of the last load, which the panel's row used to show in the ⓘ tooltip: the title of
   * a toolbar command is fixed, and the "Plugin status…" item in the "⋯" menu shows them in a notification.
   */
  statusText(): string {
    return statusText(this.agent.status(), this.last ? hourMinute(this.last.when) : undefined, this.strings);
  }

  private setLoading(active: boolean): void {
    this.toLoad = active;
    void this.post({ type: 'loading', active });
  }

  /**
   * Sends a message to every open page, or only to `to`; `true` when at least one took it. A page that refuses or
   * fails does not stop the others.
   */
  private async post(message: HostMessage, to?: Surface): Promise<boolean> {
    const targets = to ? (this.views.has(to) ? [to] : []) : [...this.views];
    this.deps.probe?.record(message);
    const results = await Promise.allSettled(targets.map((v) => v.webview.postMessage(message)));
    return results.some((r) => r.status === 'fulfilled' && r.value);
  }
}

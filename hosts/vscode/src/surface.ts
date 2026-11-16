// Where the panel appears: in the normal window, the secondary side bar view; in the Agents window, which does not
// show extension views, an editor panel (`createWebviewPanel`) with the same HTML and the same messages.
// Stable API only; `isAgentSessionsWorkspace` is a proposed API.
import type * as vscode from 'vscode';

/** The command VS Code creates to reveal the package.json `plan-relay` container. */
export const REVEAL_CONTAINER = 'workbench.view.extension.plan-relay';
/** The editor panel's `viewType`. */
export const EDITOR_PANEL = 'planRelay.editor';

/**
 * Says whether the window shows the panel container: without the `workbench.view.extension.plan-relay` command in
 * the `commands.getCommands(true)` list, the window has no extension views (the Agents window).
 */
export function hasContainer(commandList: readonly string[]): boolean {
  return commandList.includes(REVEAL_CONTAINER);
}

/**
 * What the `PanelView` class uses from the view or the editor panel: `WebviewView` already has this shape; the
 * `WebviewPanel` goes through `editorSurface`, which swaps `onDidChangeViewState` for the argument-less event.
 */
export interface Surface {
  readonly webview: vscode.Webview;
  readonly visible: boolean;
  readonly onDidChangeVisibility: vscode.Event<void>;
  readonly onDidDispose: vscode.Event<void>;
}

export function editorSurface(panel: vscode.WebviewPanel): Surface {
  return {
    webview: panel.webview,
    get visible() {
      return panel.visible;
    },
    onDidChangeVisibility: (listener, thisOne?: unknown, disposables?: vscode.Disposable[]) =>
      panel.onDidChangeViewState(() => void listener.call(thisOne), undefined, disposables),
    onDidDispose: (listener, thisOne?: unknown, disposables?: vscode.Disposable[]) => panel.onDidDispose(listener, thisOne, disposables),
  };
}

/** Opens the editor panel with scripts enabled and only the resources from `roots`, like the view. */
export function createEditorPanel(
  window: Pick<typeof vscode.window, 'createWebviewPanel'>,
  title: string,
  column: vscode.ViewColumn,
  roots: vscode.Uri[],
): vscode.WebviewPanel {
  return window.createWebviewPanel(EDITOR_PANEL, title, column, { enableScripts: true, localResourceRoots: roots });
}

export interface RevealDeps {
  /** `vscode.commands.getCommands(true)`. */
  commandList(): Thenable<string[]>;
  /** `vscode.commands.executeCommand`. */
  execute(command: string): Thenable<unknown>;
  /** The open editor panel, if any: it is revealed instead of opening another. */
  isOpen(): Pick<vscode.WebviewPanel, 'reveal'> | undefined;
  /** Creates the editor panel (`vscode.window.createWebviewPanel`) and wires it to the `PanelView` class. */
  create(): void;
}

/**
 * Reveals the panel: the container, when the window has it; otherwise brings the open editor panel to the front, or
 * creates one. Says which path it took.
 */
export async function revealPanel(deps: RevealDeps): Promise<'container' | 'editor'> {
  if (hasContainer(await deps.commandList())) {
    await deps.execute(REVEAL_CONTAINER);
    return 'container';
  }
  const isOpen = deps.isOpen();
  if (isOpen) isOpen.reveal();
  else deps.create();
  return 'editor';
}

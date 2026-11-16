import type * as vscode from 'vscode';
import { describe, expect, it } from 'vitest';
import { EDITOR_PANEL, REVEAL_CONTAINER, createEditorPanel, revealPanel, editorSurface, hasContainer } from './surface';

// The Agents window does not show extension views; the panel opens as an editor there.
const NORMAL_WINDOW_COMMANDS = ['workbench.action.files.save', REVEAL_CONTAINER, 'planRelay.show'];
const AGENTS_WINDOW_COMMANDS = ['workbench.action.files.save', 'planRelay.show'];

describe('hasContainer', () => {
  it('with the container command in the list: window with extension views', () => {
    expect(hasContainer(NORMAL_WINDOW_COMMANDS)).toBe(true);
  });

  it('without it: window without extension views (the Agents window)', () => {
    expect(hasContainer(AGENTS_WINDOW_COMMANDS)).toBe(false);
    expect(hasContainer([])).toBe(false);
  });
});

/** A fake `vscode.window` that only knows how to create editor panels and records each call. */
function fakeWindow() {
  const calls: unknown[][] = [];
  const revealed: number[] = [];
  const window = {
    createWebviewPanel: (...args: unknown[]) => {
      calls.push(args);
      return { reveal: () => revealed.push(calls.length) } as unknown as vscode.WebviewPanel;
    },
  } as unknown as Pick<typeof vscode.window, 'createWebviewPanel'>;
  return { window, calls, revealed };
}

describe('revealPanel ("Plan Relay: Show panel" and the first time)', () => {
  function scenario(commandList: string[]) {
    const { window, calls, revealed } = fakeWindow();
    const executed: string[] = [];
    let isOpen: vscode.WebviewPanel | undefined;
    const roots = [{ path: '/ext/dist' }] as unknown as vscode.Uri[];
    const deps = {
      commandList: () => Promise.resolve(commandList),
      execute: (c: string) => {
        executed.push(c);
        return Promise.resolve();
      },
      isOpen: () => isOpen,
      create: () => {
        isOpen = createEditorPanel(window, 'Plan Relay', 1, roots);
      },
    };
    return { deps, calls, revealed, executed, roots };
  }

  it('in the normal window it reveals the container and creates no editor panel', async () => {
    const c = scenario(NORMAL_WINDOW_COMMANDS);
    expect(await revealPanel(c.deps)).toBe('container');
    expect(c.executed).toEqual([REVEAL_CONTAINER]);
    expect(c.calls).toEqual([]);
  });

  it('without the container command it calls createWebviewPanel, with scripts and only the extension resources', async () => {
    const c = scenario(AGENTS_WINDOW_COMMANDS);
    expect(await revealPanel(c.deps)).toBe('editor');
    expect(c.executed).toEqual([]);
    expect(c.calls).toEqual([[EDITOR_PANEL, 'Plan Relay', 1, { enableScripts: true, localResourceRoots: c.roots }]]);
  });

  it('with the editor panel already open, it brings the same one to the front instead of opening another', async () => {
    const c = scenario(AGENTS_WINDOW_COMMANDS);
    await revealPanel(c.deps);
    await revealPanel(c.deps);
    expect(c.calls).toHaveLength(1);
    expect(c.revealed).toEqual([1]);
  });
});

describe('editorSurface', () => {
  it('the editor panel works as the view: visible follows, and the state change becomes a visibility change', () => {
    let visible = true;
    const listeners: Array<() => void> = [];
    const closes: Array<() => void> = [];
    const webview = {} as vscode.Webview;
    const panel = {
      webview,
      get visible() {
        return visible;
      },
      onDidChangeViewState: (fn: () => void) => {
        listeners.push(fn);
        return { dispose() {} };
      },
      onDidDispose: (fn: () => void) => {
        closes.push(fn);
        return { dispose() {} };
      },
    } as unknown as vscode.WebviewPanel;
    const s = editorSurface(panel);
    const seen: boolean[] = [];
    s.onDidChangeVisibility(() => seen.push(s.visible));
    let closed = false;
    s.onDidDispose(() => (closed = true));
    expect(s.webview).toBe(webview);
    visible = false;
    listeners.forEach((fn) => fn());
    visible = true;
    listeners.forEach((fn) => fn());
    expect(seen).toEqual([false, true]);
    closes.forEach((fn) => fn());
    expect(closed).toBe(true);
  });
});

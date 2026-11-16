// The `ExtensionContext` that `activate` receives in the unit tests, and the start of the host on the `vscode` fake.
import type * as vscode from 'vscode';
import { activate } from '../extension';
import { ExtensionMode, Uri, fake } from './vscode';

export interface ActiveHost {
  context: vscode.ExtensionContext;
  /** What `activate` returned: the integration tests' probe in Test mode. */
  exports: ReturnType<typeof activate>;
  /** Disposes what `activate` registered (the schedule's timer, the watchers, the commands). */
  dispose(): void;
}

/** A context in the given mode (Production by default) with a workspace state in memory. */
export function fakeContext(mode: number = ExtensionMode.Production): vscode.ExtensionContext {
  const state = new Map<string, unknown>();
  return {
    subscriptions: [] as { dispose(): unknown }[],
    extensionUri: Uri.file('/ext'),
    extensionMode: mode,
    extension: { packageJSON: { name: 'plan-relay', publisher: 'saboyafelipe', version: '0.1.0' } },
    workspaceState: {
      get: (key: string) => state.get(key),
      update: (key: string, value: unknown) => {
        state.set(key, value);
        return Promise.resolve();
      },
    },
  } as unknown as vscode.ExtensionContext;
}

export interface HostOptions {
  /** The extension mode; Production by default. */
  mode?: number;
  /** Prepares the fresh fake (folders, language, settings) before `activate`. */
  prepare?: () => void;
}

/**
 * Activates the host on a fresh fake. The agent's binary is a path that does not exist, so reading the plugin fails at
 * once instead of running the `claude` of the machine.
 */
export function activateHost(options: HostOptions = {}): ActiveHost {
  fake.reset();
  fake.settings.set('planRelay.claudePath', '/nonexistent/claude');
  options.prepare?.();
  const context = fakeContext(options.mode);
  const exports = activate(context);
  return {
    context,
    exports,
    dispose: () => {
      for (const s of context.subscriptions) void s.dispose();
    },
  };
}

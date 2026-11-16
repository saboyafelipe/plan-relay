// The file watchers that trigger a reload: one per glob and per workspace folder, rebuilt when the folders change.
import * as vscode from 'vscode';
import type { Strings } from '@plan-relay/i18n';

/** The files whose change changes the state of a plan, relative to the workspace folder. */
export const WATCHED_GLOBS = [
  'agent_plans/*/phase-*/*.md',
  'agent_plans/*/notes/run-*.md',
  'agent_plans/*/plan.json',
  'agent_plans/_ideas/*.md',
];

export class Watchers implements vscode.Disposable {
  private watchers: vscode.FileSystemWatcher[] = [];

  constructor(
    /** The agent's settings files, relative to the folder; a change re-reads the plugin. */
    private readonly agentSettings: readonly string[],
    private readonly onChange: () => void,
    private readonly onSettingsChange: () => void,
    private readonly channel: { info(text: string): void },
    private readonly strings: Strings,
  ) {
    this.redo();
  }

  redo(): void {
    this.release();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      for (const [globs, fn] of [
        [WATCHED_GLOBS, this.onChange],
        [this.agentSettings, this.onSettingsChange],
      ] as const) {
        for (const glob of globs) {
          const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, glob));
          w.onDidCreate(fn);
          w.onDidChange(fn);
          w.onDidDelete(fn);
          this.watchers.push(w);
        }
      }
    }
    this.channel.info(this.strings.t('log.watchers', this.watchers.length, vscode.workspace.workspaceFolders?.length ?? 0));
  }

  dispose(): void {
    this.release();
  }

  private release(): void {
    for (const w of this.watchers) w.dispose();
    this.watchers = [];
  }
}

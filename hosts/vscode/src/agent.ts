// The part of the panel that talks to the agent provider: the plugin state for the first workspace folder,
// install and uninstall, and the install offer before an action that needs the plugin. It was split out of the
// `PanelView` class in extension.ts; reading the plans and the actions live in other modules.
import * as vscode from 'vscode';
import type { PluginScope, PluginView } from '@plan-relay/panel';
import { stringsFor, type Strings } from '@plan-relay/i18n';
import type { Provider, InstallOutcome, InstallSource } from './agents/provider';
import { pluginLine, inChannel } from './channel';
import { errorMessage } from './util';
import type { CannedAnswers } from './canned-answers';
import { askForOption, optionLabels } from './actions/modal';

export const VIEW = 'planRelay.panel';

export function active(plugin: PluginView | undefined): boolean {
  return plugin?.state === 'active-project' || plugin?.state === 'active-user';
}

/** The error notice for each installation change. */
const FAILED_KEY = { install: 'install.didNotInstall', uninstall: 'install.didNotUninstall' } as const;

type Channel = { info(text: string): void; warn(text: string): void; error(text: string): void };

export class AgentWiring {
  private plugin: PluginView | undefined;
  private toInstall = false;

  constructor(
    readonly provider: Provider,
    private readonly channel: Channel,
    /** Called on each new plugin state, to send it to the view. */
    private readonly onChange: (plugin: PluginView) => void,
    private readonly strings: Strings = stringsFor(),
  ) {}

  /** The last plugin state read (or in progress); `undefined` before the first read. */
  status(): PluginView | undefined {
    return this.plugin;
  }

  /** Reads the plugin state for the first workspace folder and sends it to the view. Does not reject. */
  async read(): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!folder || this.toInstall) return;
    try {
      const status = await this.provider.installState(folder);
      if (this.toInstall) return;
      this.channel[status.state === 'error' ? 'warn' : 'info'](pluginLine(status, this.strings));
      this.define(status);
    } catch (error) {
      this.channel.error(this.t('log.pluginReadFailed', errorMessage(error)));
    }
  }

  /**
   * The plugin is active for the folder; if not, offers to install it (or, without an automatable installation,
   * says how). `false` when it is still not active. `detail` is the reason, shown in the modal.
   */
  async ensure(answers: CannedAnswers | undefined, detail: string): Promise<boolean> {
    if (!this.plugin || this.plugin.state === 'checking') await this.read();
    if (active(this.plugin)) return true;
    this.channel.info(this.t('log.pluginOffer', this.plugin ? inChannel(this.plugin.state, this.strings) : this.t('log.unknown')));
    if (!this.provider.automatedInstall) {
      void vscode.window.showWarningMessage(this.t('notice.brand', this.t('install.inactiveAs', this.provider.howToInstall)));
      return false;
    }
    let scope: 'project' | 'user' | undefined;
    if (answers?.install !== undefined) {
      this.channel.info(this.t('log.pluginOfferGiven', answers.install === false ? this.t('log.cancel') : answers.install));
      if (answers.install === false) return false;
      scope = answers.install;
    } else {
      const choice = await askForOption(
        (labels) => vscode.window.showWarningMessage(this.t('install.inactive'), { modal: true, detail: detail }, ...labels),
        ['install'],
        optionLabels(this.strings),
      );
      if (choice !== 'install') return false;
    }
    // A canned scope exists only in Development and Test (canned-answers.ts): it also answers the source question.
    await this.install(scope, answers?.install !== undefined);
    return active(this.plugin);
  }

  /**
   * Asks for the scope (if not given), naming the source when it is not the default; a source in the open folder asks
   * a "yes" of its own, unless `canned`. Then installs from that same source and reads the state again.
   */
  async install(scope?: 'project' | 'user', canned = false): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!folder) {
      void vscode.window.showWarningMessage(this.t('notice.brand', this.t('install.openAFolder')));
      return;
    }
    if (this.toInstall) return;
    if (!this.provider.automatedInstall) {
      void vscode.window.showInformationMessage(this.t('notice.brand', this.provider.howToInstall));
      return;
    }
    let source: InstallSource | undefined;
    try {
      source = await this.provider.installSource?.(folder);
    } catch (error) {
      // Not knowing the source must not fall back to an install that picks it again without asking.
      void vscode.window.showErrorMessage(this.t('notice.brand', this.t(FAILED_KEY.install, errorMessage(error))));
      return;
    }
    const chosen = scope ?? (await this.chooseScope(source));
    if (!chosen) return;
    if (source?.origin === 'workspace' && !canned && !(await this.confirmWorkspaceSource(source))) return;
    await this.change(() => this.provider.install(folder, chosen, source), 'install');
  }

  private async confirmWorkspaceSource(source: InstallSource): Promise<boolean> {
    const choice = await askForOption(
      (labels) =>
        vscode.window.showWarningMessage(
          this.t('install.fromWorkspace'),
          { modal: true, detail: this.t('install.fromWorkspaceDetail', source.source) },
          ...labels,
        ),
      ['install-from-folder'],
      optionLabels(this.strings),
    );
    return choice === 'install-from-folder';
  }

  /** Uninstalls from the given scope or from the scope where it is active, and reads the state again. */
  async uninstall(scope?: PluginScope): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const current = this.plugin && 'scope' in this.plugin ? this.plugin.scope : undefined;
    const chosen = scope ?? current;
    if (!folder || !chosen) {
      void vscode.window.showWarningMessage(this.t('notice.brand', this.t('install.notInstalled')));
      return;
    }
    if (this.toInstall) return;
    await this.change(() => this.provider.uninstall(folder, chosen), 'uninstall');
  }

  private async chooseScope(source: InstallSource | undefined): Promise<'project' | 'user' | undefined> {
    const named = source !== undefined && source.origin !== 'default';
    const choice = await vscode.window.showQuickPick(
      this.provider.scopes.map((e) => ({ label: e.label, description: e.descriptionText, scope: e.scope })),
      {
        title: this.t('notice.brand', this.t('install.installTitle')),
        placeHolder: named ? this.t('install.whereToInstallFrom', source.source) : this.t('install.whereToInstall'),
      },
    );
    return choice?.scope;
  }

  private async change(action: () => Promise<InstallOutcome>, name: 'install' | 'uninstall'): Promise<void> {
    this.toInstall = true;
    this.define({ state: 'installing' });
    // The view's progress bar follows the installation (seconds), besides the "Installing…" button.
    await vscode.window.withProgress({ location: { viewId: VIEW } }, async () => {
      try {
        const r = await action();
        const nameInChannel = inChannel(name, this.strings);
        if (r.ok) {
          this.channel.info(`plugin: ${nameInChannel} ok — ${r.message}`);
          void vscode.window.showInformationMessage(this.t('notice.brand', r.message));
        } else {
          this.channel.warn(`plugin: ${nameInChannel} ${this.t('log.failed', r.error)}`);
          void vscode.window.showErrorMessage(this.t('notice.brand', this.t(FAILED_KEY[name], r.error)));
        }
      } catch (error) {
        this.channel.error(`plugin: ${inChannel(name, this.strings)} ${this.t('log.failed', errorMessage(error))}`);
        void vscode.window.showErrorMessage(this.t('notice.brand', this.t(FAILED_KEY[name], errorMessage(error))));
      } finally {
        this.toInstall = false;
      }
      await this.read();
    });
  }

  private get t(): Strings['t'] {
    return this.strings.t;
  }

  private define(plugin: PluginView): void {
    this.plugin = plugin;
    this.onChange(plugin);
  }
}

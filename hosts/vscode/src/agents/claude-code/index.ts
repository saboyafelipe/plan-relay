// The Claude Code provider: the official extension (`anthropic.claude-code`) to open with a prompt, its binary
// (or the configured one, or the one on the PATH) to read and change the plugin installation through
// `claude plugin …`, and the plugin's skills with the prefix of the installed package (`/plan-relay:` in English,
// `/plan-relay-pt-br:`). It installs the package of the editor language.
import type * as vscode from 'vscode';
import { stringsFor, type Strings } from '@plan-relay/i18n';
import type { Provider } from '../provider';
import { inChannel } from '../../channel';
import { errorMessage } from '../../util';
import { openClaude, vscodeDeps, CLAUDE_EXTENSION, AGENT_NAME } from './open';
import { readPlugin } from './plugin-state';
import { pluginForLanguage, pluginId, type PluginName } from './plugin-name';
import { findMarketplace, uninstall, DEFAULT_SOURCE, install } from './install';
import { claudeCodeChecks } from './environment';
import { configuredBinary, installDeps, environmentDeps, pluginStateDeps } from './wiring';
import { claudeCodePrompt } from './prompts';

type Channel = { info(text: string): void; warn(text: string): void };

export function claudeCodeProvider(api: typeof vscode, channel: Channel, strings: Strings = stringsFor()): Provider {
  const { t } = strings;
  // The package of the editor language, and the one the last state reading found installed: the prompts, the
  // uninstall and the footer messages follow the installed one, which may be the other language.
  const preferred = pluginForLanguage(strings.language);
  let installed: PluginName | undefined;
  const current = (): PluginName => installed ?? preferred;
  const configuredMarketplace = (): string => api.workspace.getConfiguration('planRelay').get<string>('marketplace', '');
  return {
    name: AGENT_NAME,
    automatedInstall: true,
    howToInstall: t(
      'provider.howToInstall',
      `claude plugin marketplace add ${DEFAULT_SOURCE}`,
      `claude plugin install ${pluginId(preferred)}`,
    ),
    scopes: [
      {
        scope: 'project',
        label: t('provider.projectScope'),
        descriptionText: t('provider.projectScopeDescription', '.claude/settings.json'),
      },
      { scope: 'user', label: t('provider.userScope'), descriptionText: '~/.claude/settings.json' },
    ],
    // The folder's Claude Code settings: where the project installation enables the plugin.
    watchedSettings: ['.claude/settings.json', '.claude/settings.local.json'],
    detect: () => api.extensions.getExtension(CLAUDE_EXTENSION) !== undefined,
    installState: async (folder) => {
      const binary = configuredBinary(api);
      const started = Date.now();
      try {
        const reading = await readPlugin(folder, pluginStateDeps(binary, strings), preferred);
        installed = reading.plugin;
        channel.info(`claude: plugin list (${inChannel(binary.origin, strings)}: ${binary.path}, ${Date.now() - started} ms)`);
        return reading.state;
      } catch (error) {
        return { state: 'error', error: errorMessage(error) };
      }
    },
    installSource: (folder) => findMarketplace(folder, configuredMarketplace(), installDeps(configuredBinary(api), channel, strings)),
    install: async (folder, scope, source) => {
      const binary = configuredBinary(api);
      const deps = installDeps(binary, channel, strings);
      const mk = source ?? (await findMarketplace(folder, configuredMarketplace(), deps));
      channel.info(
        t('log.pluginInstall', scope, mk.source, inChannel(mk.origin, strings), `${inChannel(binary.origin, strings)}: ${binary.path}`),
      );
      const r = await install(folder, scope, mk.source, deps, preferred);
      if (r.ok) installed = preferred;
      if (r.ok || mk.origin !== 'default') return r;
      return { ok: false, error: t('provider.defaultSourceFailed', r.error, mk.source, 'planRelay.marketplace') };
    },
    uninstall: (folder, scope) => uninstall(folder, scope, installDeps(configuredBinary(api), channel, strings), current()),
    openWithPrompt: (prompt) => openClaude(prompt, vscodeDeps(api, channel, strings)),
    prompt: (action) => claudeCodePrompt(action, current()),
    checksList: (folder, plugin) =>
      claudeCodeChecks(folder, plugin, { ...environmentDeps(configuredBinary(api), strings), plugin: current() }),
  };
}

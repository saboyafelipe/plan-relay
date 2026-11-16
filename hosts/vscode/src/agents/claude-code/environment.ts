// The Claude Code checks for the panel footer: the same as the adapter's check-agent.sh (agent-cli, agent-auth,
// plugin, plugin-current; all optional), without sh. The CLI runs through process.ts only for
// `auth status --json`; the plugin comes from the state the panel already read through `plugin list --json`.
import type { Check } from '@plan-relay/reader';
import type { PluginView } from '@plan-relay/panel';
import { stringsFor, type Strings } from '@plan-relay/i18n';
import type { ProcessError, ProcessOutput } from '../../process';
import { SHORT_NAME, AGENT_NAME } from './open';
import type { Binary } from './binary';
import { pluginId, type PluginName } from './plugin-name';

export interface AgentEnvironmentDeps {
  /** The binary the extension uses for the `plugin …` commands (binary.ts). */
  binary: Binary;
  /** Looks for an executable on the PATH (`findOnPath` from core/reader). */
  search(name: string): string | undefined;
  executable(path: string): boolean;
  /** Runs the binary with `args` and the given cwd. */
  runCommand(args: string[], cwd: string): Promise<ProcessOutput | ProcessError>;
  /**
   * Compares the source folder with the cache copy (copy.ts): `undefined` when they cannot be compared.
   * Without it, the copy is not compared.
   */
  sameFolders?(origin: string, cache: string): Promise<boolean | undefined>;
  strings?: Strings;
  /** The package the messages name: the installed one, or the one the panel would install (English without it). */
  plugin?: PluginName;
}

/** The CLI's path, or `undefined` when there is none. */
function cli(deps: AgentEnvironmentDeps): string | undefined {
  const { binary } = deps;
  if (binary.origin === 'path') return deps.search(binary.path);
  return deps.executable(binary.path) ? binary.path : undefined;
}

/** The login through `auth status --json`: only `loggedIn` and `authMethod`; email and organization never leave here. */
async function login(folder: string, deps: AgentEnvironmentDeps, t: Strings['t']): Promise<Check> {
  const output = await deps.runCommand(['auth', 'status', '--json'], folder);
  // Without a login the CLI may exit with a non-zero code: the JSON then comes in the error text.
  const text = 'error' in output ? output.error : output.stdout;
  const method = /"authMethod"\s*:\s*"([^"]*)"/.exec(text)?.[1];
  if (/"loggedIn"\s*:\s*true/.test(text)) {
    return {
      id: 'agent-auth',
      status: 'ok',
      required: false,
      detail: method ? t('environment.authOkMethod', method) : t('environment.authOk'),
    };
  }
  if (/"loggedIn"\s*:\s*false/.test(text))
    return { id: 'agent-auth', status: 'missing', required: false, detail: t('environment.authMissing', SHORT_NAME) };
  return { id: 'agent-auth', status: 'unknown', required: false, detail: t('environment.authUnreadable', SHORT_NAME) };
}

const v = (id: string, status: Check['status'], detail: string): Check => ({ id, status, required: false, detail });

/**
 * plugin-current with the version up to date: in a folder marketplace, the cache copy against the source,
 * like check-agent.sh.
 */
async function upToDate(plugin: Extract<PluginView, { scope: unknown }>, deps: AgentEnvironmentDeps, t: Strings['t']): Promise<Check> {
  const { copy } = plugin;
  if (copy && deps.sameFolders && (await deps.sameFolders(copy.origin, copy.cache)) === false) {
    return v(
      'plugin-current',
      'warning',
      t('environment.staleCache', copy.cache, SHORT_NAME, pluginId(deps.plugin ?? 'plan-relay'), plugin.scope),
    );
  }
  return v('plugin-current', 'ok', t('environment.versionUpToDate'));
}

/** plugin and plugin-current from the plugin state already read. */
async function pluginOf(plugin: PluginView | undefined, deps: AgentEnvironmentDeps, t: Strings['t']): Promise<Check[]> {
  const name = deps.plugin ?? 'plan-relay';
  const id = pluginId(name);
  switch (plugin?.state) {
    case 'active-project':
    case 'active-user':
    case 'inactive': {
      const scope = t(`scope.${plugin.scope}`);
      const pluginOf =
        plugin.state === 'inactive'
          ? v('plugin', 'warning', t('environment.pluginDisabled', name, scope, SHORT_NAME, id))
          : v('plugin', 'ok', t('environment.pluginOk', name, scope));
      const current = plugin.newVersion
        ? v(
            'plugin-current',
            'warning',
            t('environment.newVersion', plugin.newVersion.registered, plugin.newVersion.folder, SHORT_NAME, id),
          )
        : await upToDate(plugin, deps, t);
      return [pluginOf, current];
    }
    case 'not-installed':
      return [
        v('plugin', 'missing', t('environment.pluginMissing', name, SHORT_NAME, id)),
        v('plugin-current', 'unknown', t('environment.pluginNotInstalled')),
      ];
    case 'error':
      return [
        v('plugin', 'unknown', t('environment.pluginError', plugin.error)),
        v('plugin-current', 'unknown', t('environment.pluginError', plugin.error)),
      ];
    default:
      return [v('plugin', 'unknown', t('environment.pluginUnread')), v('plugin-current', 'unknown', t('environment.pluginUnread'))];
  }
}

/** agent-cli, agent-auth, plugin and plugin-current, in this order (check-agent.sh's). Does not reject. */
export async function claudeCodeChecks(folder: string, plugin: PluginView | undefined, deps: AgentEnvironmentDeps): Promise<Check[]> {
  const { t } = deps.strings ?? stringsFor();
  const path = cli(deps);
  if (!path) {
    const detail =
      deps.binary.origin === 'path'
        ? t('environment.cliMissing', SHORT_NAME, AGENT_NAME)
        : t('environment.configuredCliMissing', deps.binary.path);
    const withoutCli = t('environment.noCli', SHORT_NAME);
    return [
      { id: 'agent-cli', status: 'missing', required: false, detail: detail },
      { id: 'agent-auth', status: 'unknown', required: false, detail: withoutCli },
      { id: 'plugin', status: 'unknown', required: false, detail: withoutCli },
      { id: 'plugin-current', status: 'unknown', required: false, detail: withoutCli },
    ];
  }
  return [
    { id: 'agent-cli', status: 'ok', required: false, detail: path },
    await login(folder, deps, t),
    ...(await pluginOf(plugin, deps, t)),
  ];
}

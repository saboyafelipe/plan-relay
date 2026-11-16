// Is the plan-relay plugin (either package: `plan-relay` in English or `plan-relay-pt-br`) active for this folder?
// It is decided from the output of `claude plugin list --json`,
// run with the cwd in the folder: the CLI merges the entries of all projects, and `enabled` says whether the plugin
// is on in the settings seen from here — so a project entry only counts with this folder's `projectPath`.
import type { PluginScope, PluginState } from '@plan-relay/panel';
import { stringsFor, type Strings } from '@plan-relay/i18n';
import { headOf, type ProcessError, type ProcessOutput } from '../../process';
import { pluginId, pluginOfId, type PluginName } from './plugin-name';

// The types belong to the panel, which displays them; `newVersion` is `version` (registry) different from
// `folderVersion` (marketplace folder).
export type { PluginScope, PluginState };

/** The id of the English package, the one a user gets without choosing. */
export const PLUGIN_ID = pluginId('plan-relay');

/** The state and, when installed, which package. */
export interface PluginReading {
  state: PluginState;
  plugin?: PluginName;
}

interface ListEntry {
  id: string;
  scope: string;
  enabled: boolean;
  version?: string;
  folderVersion?: string;
  projectPath?: string;
  readFromFolder?: string;
  installPath?: string;
}

function isEntry(x: unknown): x is ListEntry {
  if (typeof x !== 'object' || x === null) return false;
  const e = x as Record<string, unknown>;
  return typeof e.id === 'string' && typeof e.scope === 'string' && typeof e.enabled === 'boolean';
}

function newVersion(e: ListEntry): { registered: string; folder: string } | undefined {
  if (typeof e.version !== 'string' || typeof e.folderVersion !== 'string') return undefined;
  return e.version !== e.folderVersion ? { registered: e.version, folder: e.folderVersion } : undefined;
}

/** The source (`readFromFolder`) and the cache copy (`installPath`), when the CLI brings both. */
function copy(e: ListEntry): { origin: string; cache: string } | undefined {
  if (typeof e.readFromFolder !== 'string' || typeof e.installPath !== 'string') return undefined;
  return { origin: e.readFromFolder, cache: e.installPath };
}

/**
 * Decides the state and the package from the stdout of `plugin list --json`. `folders` are the paths that count
 * for this folder (the workspace one and the real one: the CLI records `/private/tmp/…` for `/tmp/…`).
 * Order: active in project (or local) > active in user > installed but disabled > not installed; within the same
 * rank, the `preferred` package (the editor language's) comes first.
 */
export function decidePlugin(
  stdout: string,
  folders: readonly string[],
  strings: Strings = stringsFor(),
  preferred: PluginName = 'plan-relay',
): PluginReading {
  const { t } = strings;
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    return { state: { state: 'error', error: t('provider.invalidList', headOf(stdout) || t('provider.empty')) } };
  }
  if (!Array.isArray(json)) return { state: { state: 'error', error: t('provider.listNotList') } };
  const ours = json
    .filter(isEntry)
    .filter((e) => pluginOfId(e.id) !== undefined)
    .sort((a, b) => Number(pluginOfId(b.id) === preferred) - Number(pluginOfId(a.id) === preferred));
  const fromHere = ours.filter(
    (e) =>
      e.scope === 'user' ||
      ((e.scope === 'project' || e.scope === 'local') && e.projectPath !== undefined && folders.includes(e.projectPath)),
  );
  const choose = (e: ListEntry, state: 'active-project' | 'active-user' | 'inactive'): PluginReading => {
    const newerVersion = newVersion(e);
    const c = copy(e);
    const plugin = pluginOfId(e.id);
    return {
      state: { state, scope: e.scope as PluginScope, ...(newerVersion ? { newVersion: newerVersion } : {}), ...(c ? { copy: c } : {}) },
      ...(plugin ? { plugin } : {}),
    };
  };
  const project = fromHere.find((e) => e.scope !== 'user' && e.enabled);
  if (project) return choose(project, 'active-project');
  const userList = fromHere.find((e) => e.scope === 'user' && e.enabled);
  if (userList) return choose(userList, 'active-user');
  const disabled = fromHere[0];
  if (disabled) return choose(disabled, 'inactive');
  return { state: { state: 'not-installed' } };
}

/** The state only (see `decidePlugin`). */
export function decidePluginState(stdout: string, folders: readonly string[], strings: Strings = stringsFor()): PluginState {
  return decidePlugin(stdout, folders, strings).state;
}

export interface PluginStateDeps {
  /** Runs the Claude binary with `args` and the given cwd. */
  runCommand(args: string[], cwd: string): Promise<ProcessOutput | ProcessError>;
  /** `fs.realpathSync`; may throw. */
  realPath(path: string): string;
  /** The language of the errors (English without it). */
  strings?: Strings;
}

/** The state of the folder and which package is installed; `preferred` breaks a tie between the two packages. */
export async function readPlugin(folder: string, deps: PluginStateDeps, preferred: PluginName = 'plan-relay'): Promise<PluginReading> {
  const output = await deps.runCommand(['plugin', 'list', '--json'], folder);
  if ('error' in output) return { state: { state: 'error', error: output.error } };
  const folders = [folder];
  try {
    const real = deps.realPath(folder);
    if (real !== folder) folders.push(real);
  } catch {
    // a folder that does not resolve: compare only with the given path
  }
  return decidePlugin(output.stdout, folders, deps.strings, preferred);
}

export async function readPluginState(folder: string, deps: PluginStateDeps): Promise<PluginState> {
  return (await readPlugin(folder, deps)).state;
}

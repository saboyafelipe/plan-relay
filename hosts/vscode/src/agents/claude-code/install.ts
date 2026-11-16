// Install and uninstall the plan-relay plugin (the package named: `plan-relay` in English, `plan-relay-pt-br`) only
// through `claude plugin … --json`. The extension does not
// rewrite the user's settings or delete agent folders: the `"enabledPlugins": {}` and the cache that
// `uninstall` leaves behind do not prevent reinstalling (verified with CLI 2.1.316).
import { join } from 'node:path';
import { stringsFor, type Strings } from '@plan-relay/i18n';
import type { ProcessError, ProcessOutput } from '../../process';
import type { InstallSource } from '../provider';
import { asRecord } from '../../util';
import { SHORT_NAME } from './open';
import type { PluginScope } from './plugin-state';
import { MARKETPLACE, pluginId, type PluginName } from './plugin-name';

export interface InstallDeps {
  /** Runs the Claude binary with `args` and the given cwd. */
  runCommand(args: string[], cwd: string): Promise<ProcessOutput | ProcessError>;
  /** The file's text, or `undefined` if it does not exist. */
  readFileText(path: string): Promise<string | undefined>;
  channel: { info(text: string): void; warn(text: string): void };
  /** The language of the errors and the output channel (English without it). */
  strings?: Strings;
}

export type InstallResult = { ok: true; message: string } | { ok: false; error: string };

function readJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The CLI with `--json` writes a result line (the last one); `outcome: "ok"` is success. */
/** The end of the output channel line for a CLI step: `ok`, or that it failed and why. */
function okOrFailed(r: InstallResult, strings: Strings = stringsFor()): string {
  return r.ok ? 'ok' : strings.t('log.failed', r.error);
}

function cliResult(output: ProcessOutput | ProcessError, strings: Strings = stringsFor()): InstallResult {
  if ('error' in output) return { ok: false, error: output.error };
  const last = output.stdout.trim().split('\n').pop() ?? '';
  const r = asRecord(readJson(last));
  if (!r) return { ok: false, error: strings.t('provider.noJson', SHORT_NAME, last.slice(0, 200) || strings.t('provider.blank')) };
  const message = typeof r.message === 'string' ? r.message : `outcome ${String(r.outcome)}`;
  return r.outcome === 'ok' ? { ok: true, message } : { ok: false, error: message };
}

/**
 * The default marketplace source: the public repository, through git (GitHub `owner/repo`). The CLI
 * clones the repository as is; its `marketplace.json` points to the versioned `./dist/claude-code-en`
 * (`plan-relay`) and `./dist/claude-code` (`plan-relay-pt-br`).
 * The repository already exists; installing from this source only works after the first push.
 */
export const DEFAULT_SOURCE = 'saboyafelipe/plan-relay';

export type SourceOrigin = InstallSource['origin'];

/** What `plugin marketplace add` accepts for an already known marketplace: the folder, the git URL or the owner/repo. */
function knownSource(m: Record<string, unknown> | undefined): string | undefined {
  for (const key of ['path', 'url', 'repo']) {
    const v = m?.[key];
    if (typeof v === 'string' && v) return v;
  }
  return undefined;
}

/**
 * Where to install from: `planRelay.marketplace` (folder, owner/repo or git URL); otherwise the folder itself,
 * when it has plan-relay's `.claude-plugin/marketplace.json` (development); otherwise the `plan-relay`
 * marketplace the CLI already knows (`plugin marketplace list --json`), to avoid declaring another one with the
 * same name; otherwise the default git source.
 */
export async function findMarketplace(folder: string, configured: string, deps: InstallDeps): Promise<InstallSource> {
  if (configured.trim()) return { source: configured.trim(), origin: 'configured' };
  const manifest = asRecord(readJson((await deps.readFileText(join(folder, '.claude-plugin', 'marketplace.json'))) ?? ''));
  if (manifest?.name === MARKETPLACE) return { source: folder, origin: 'workspace' };
  const output = await deps.runCommand(['plugin', 'marketplace', 'list', '--json'], folder);
  if (!('error' in output)) {
    const list = readJson(output.stdout);
    const known = Array.isArray(list) ? list.map(asRecord).find((m) => m?.name === MARKETPLACE) : undefined;
    const source = knownSource(known);
    if (source) return { source, origin: 'known' };
  }
  return { source: DEFAULT_SOURCE, origin: 'default' };
}

/** Read-only: is the marketplace already in the project's settings? */
async function declaredMarketplace(folder: string, deps: InstallDeps): Promise<boolean> {
  const text = await deps.readFileText(join(folder, '.claude', 'settings.json'));
  const extra = asRecord(asRecord(readJson(text ?? ''))?.extraKnownMarketplaces);
  return extra !== undefined && MARKETPLACE in extra;
}

/**
 * In the project, declares the marketplace in its settings (if not there yet) and installs; in user scope, just
 * installs. `plugin` is the package (English without it).
 */
export async function install(
  folder: string,
  scope: 'project' | 'user',
  marketplace: string,
  deps: InstallDeps,
  plugin: PluginName = 'plan-relay',
): Promise<InstallResult> {
  if (scope === 'project' && !(await declaredMarketplace(folder, deps))) {
    const add = cliResult(
      await deps.runCommand(['plugin', 'marketplace', 'add', marketplace, '--scope', 'project', '--json'], folder),
      deps.strings,
    );
    deps.channel.info(`plugin: marketplace add ${okOrFailed(add, deps.strings)}`);
    if (!add.ok) return add;
  }
  const r = cliResult(
    await deps.runCommand(['plugin', 'install', plugin, '--marketplace', marketplace, '--scope', scope, '--json'], folder),
    deps.strings,
  );
  deps.channel.info(`plugin: install --scope ${scope} ${okOrFailed(r, deps.strings)}`);
  return r;
}

function howMany(output: ProcessOutput, id: string): number {
  const list = readJson(output.stdout);
  return Array.isArray(list) ? list.filter((e) => asRecord(e)?.id === id).length : 0;
}

/**
 * Uninstalls the package from the scope, only through the CLI. With other installations of the same package (other
 * projects, the other scope) it passes `--keep-data`: the data folder is a single one for all of them.
 */
export async function uninstall(
  folder: string,
  scope: PluginScope,
  deps: InstallDeps,
  plugin: PluginName = 'plan-relay',
): Promise<InstallResult> {
  const before = await deps.runCommand(['plugin', 'list', '--json'], folder);
  if ('error' in before) return { ok: false, error: before.error };
  const id = pluginId(plugin);
  const others = howMany(before, id) > 1;
  const args = ['plugin', 'uninstall', id, '--scope', scope, ...(others ? ['--keep-data'] : []), '--json'];
  const r = cliResult(await deps.runCommand(args, folder), deps.strings);
  deps.channel.info(`plugin: uninstall --scope ${scope}${others ? ' --keep-data' : ''} ${okOrFailed(r, deps.strings)}`);
  return r;
}

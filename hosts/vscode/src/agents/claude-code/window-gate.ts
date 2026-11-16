// The autopilot's 5-hour window gate: `window.sh` only probes the quota with `PLAN_RELAY_WINDOW` on in the Claude Code
// session's environment, and the place where that holds for every session of a project is the `env` of
// `.claude/settings.local.json`. This module reads and writes only that key and keeps the rest of the file as it was.
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Strings } from '@plan-relay/i18n';
import { realPaths, strictlyInside } from '../../open';
import { errorMessage, isRecord } from '../../util';

export const WINDOW_VARIABLE = 'PLAN_RELAY_WINDOW';
/** The file, relative to the workspace folder, as it is shown to the user. */
export const LOCAL_SETTINGS = '.claude/settings.local.json';

/** The values `window.sh` takes as on (its `case`); anything else, missing included, is off. */
const ON_VALUES = new Set(['on', 'ON', 'On', '1', 'true', 'TRUE', 'True', 'yes', 'YES', 'Yes']);

export type GateResult = { on: boolean } | { error: string };

type Json = Record<string, unknown>;

export function gateIsOn(value: unknown): boolean {
  return typeof value === 'string' && ON_VALUES.has(value);
}

/**
 * The settings path in `folder`, or `undefined` when `.claude` or the file is a link that leads outside the folder
 * (the same check on real paths as opening a plan file). What does not exist yet is created inside, so it passes.
 */
async function containedSettings(folder: string): Promise<string | undefined> {
  const path = join(folder, ...LOCAL_SETTINGS.split('/'));
  for (const part of [dirname(path), path]) {
    let real: [string, string];
    try {
      real = await realPaths(folder, part);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return path;
      throw error;
    }
    if (!strictlyInside(...real)) return undefined;
  }
  return path;
}

/** The parsed file: `null` when it does not exist, `undefined` when it is not an object with an object (or no) `env`. */
async function readSettings(path: string): Promise<Json | null | undefined> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || (parsed.env !== undefined && !isRecord(parsed.env))) return undefined;
  return parsed;
}

/** Temporary file next to the destination, then rename: a reader never sees half a file. */
async function writeAtomic(path: string, text: string): Promise<void> {
  const temp = `${path}.plan-relay-${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(temp, text, 'utf8');
  try {
    await rename(temp, path);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

/** The current state of the gate in the folder: a missing file or key is off. */
export async function readWindowGate(folder: string, strings: Strings): Promise<GateResult> {
  const path = await containedSettings(folder);
  if (path === undefined) return { error: strings.t('gate.outside', LOCAL_SETTINGS) };
  const settings = await readSettings(path);
  if (settings === undefined) return { error: strings.t('gate.invalid', LOCAL_SETTINGS) };
  const env = settings?.env as Json | undefined;
  return { on: gateIsOn(env?.[WINDOW_VARIABLE]) };
}

/**
 * Turns the gate on (`env.PLAN_RELAY_WINDOW = "on"`) or off (removes the key, and `env` if it becomes empty). Every
 * other key stays, in its order. A file that is not valid is not touched; turning off with no file creates nothing.
 */
export async function writeWindowGate(folder: string, on: boolean, strings: Strings): Promise<GateResult> {
  const path = await containedSettings(folder);
  if (path === undefined) return { error: strings.t('gate.outside', LOCAL_SETTINGS) };
  const settings = await readSettings(path);
  if (settings === undefined) return { error: strings.t('gate.invalid', LOCAL_SETTINGS) };
  if (settings === null && !on) return { on: false };
  const next: Json = { ...settings };
  const env: Json = { ...(next.env as Json | undefined) };
  if (on) {
    env[WINDOW_VARIABLE] = 'on';
    next.env = env;
  } else {
    delete env[WINDOW_VARIABLE];
    if (Object.keys(env).length > 0) next.env = env;
    else delete next.env;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeAtomic(path, `${JSON.stringify(next, null, 2)}\n`);
  return { on };
}

type GateChoice = 'on' | 'off';

export interface GateDeps {
  /** The workspace folders: the gate is the first one's, where the agent session opens. */
  folders(): string[];
  /** The choice between the options, or `undefined` when dismissed. */
  pick(placeholder: string, options: { id: GateChoice; label: string; detail: string }[]): Promise<GateChoice | undefined>;
  inform(text: string): void;
  warn(text: string): void;
  channel: { info(text: string): void; warn(text: string): void };
  /** The agent whose sessions read the file, for the notice. */
  agentName: string;
  strings: Strings;
}

/**
 * The panel action: shows the gate as the file has it now and writes only what the user chooses. Nothing is written
 * when the choice is dismissed or equals the current value.
 */
export async function chooseWindowGate(deps: GateDeps): Promise<void> {
  const { t } = deps.strings;
  const folder = deps.folders()[0];
  if (folder === undefined) {
    deps.warn(t('gate.noFolder'));
    return;
  }
  // A file system failure (permissions, `.claude` that is a file) becomes a warning, like an invalid file.
  const attempt = async (step: () => Promise<GateResult>): Promise<{ on: boolean } | undefined> => {
    let result: GateResult;
    try {
      result = await step();
    } catch (error) {
      result = { error: t('gate.failed', LOCAL_SETTINGS, errorMessage(error)) };
    }
    if (!('error' in result)) return result;
    deps.channel.warn(result.error);
    deps.warn(result.error);
    return undefined;
  };
  const current = await attempt(() => readWindowGate(folder, deps.strings));
  if (current === undefined) return;
  const chosen = await deps.pick(t('gate.placeholder', t(current.on ? 'gate.on' : 'gate.off')), [
    { id: 'on', label: t('gate.on'), detail: t('gate.onDetail', `${WINDOW_VARIABLE}=on`, LOCAL_SETTINGS) },
    { id: 'off', label: t('gate.off'), detail: t('gate.offDetail') },
  ]);
  if (chosen === undefined || (chosen === 'on') === current.on) return;
  const written = await attempt(() => writeWindowGate(folder, chosen === 'on', deps.strings));
  if (written === undefined) return;
  deps.channel.info(t('log.windowGate', folder, chosen));
  deps.inform(t(written.on ? 'gate.savedOn' : 'gate.savedOff', deps.agentName));
}

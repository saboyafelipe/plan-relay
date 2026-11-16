// Plan discovery: each `agent_plans/<d>/plan.json` in the workspace folders.
// A directory without plan.json is not a plan; an invalid plan.json gives an entry with an error.
// Folders starting with `_` or `.` are not plans (contract, «Files and folders»).
// A directory with only the plan file of the old format gives an entry with an error that says
// how to convert it: nothing of it is read, but the plan does not vanish from the panel unexplained.
import type { Files } from './files';
import { PLAN_FILE, readerError, validatePlanJson, type ReaderError, type PlanJson } from './contract';
import { errorMessage } from './util';

/** The name of the plan file before contract 1; only looked up to give the old-format error. */
const OLD_FORMAT_FILE = 'plano.json';

interface Base {
  /** The workspace folder where the plan lives. */
  workspaceFolder: string;
  /** The name of the plan folder in `agent_plans/`: the plan's name, whatever `name` plan.json gives. */
  name: string;
  /** The path of the plan folder. */
  folder: string;
}

export type DiscoveredPlan = (Base & { plan: PlanJson }) | (Base & { error: ReaderError });

async function readPlan(files: Files, base: Base): Promise<DiscoveredPlan | undefined> {
  let raw: string | undefined;
  try {
    raw = await files.read(files.join(base.folder, PLAN_FILE));
    if (raw === undefined) {
      const old = await files.read(files.join(base.folder, OLD_FORMAT_FILE));
      return old === undefined ? undefined : { ...base, error: readerError('oldFormat', OLD_FORMAT_FILE, PLAN_FILE) };
    }
  } catch (e) {
    return { ...base, error: readerError('unreadable', PLAN_FILE, errorMessage(e)) };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ...base, error: readerError('notJson', PLAN_FILE, errorMessage(e)) };
  }
  const plan = validatePlanJson(json);
  if ('error' in plan) return { ...base, error: { ...readerError('invalid', PLAN_FILE), cause: plan.error } };
  // The plan's name is its folder's; a `name` in plan.json that differs is not an error (contract, «plan.json»).
  return { ...base, plan: plan };
}

async function plansOfFolder(files: Files, workspaceFolder: string): Promise<DiscoveredPlan[]> {
  const root = files.join(workspaceFolder, 'agent_plans');
  let entries;
  try {
    entries = (await files.list(root)) ?? [];
  } catch {
    return [];
  }
  const names = entries
    .filter((e) => e.directory && !e.name.startsWith('_') && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const read = await Promise.all(names.map((name) => readPlan(files, { workspaceFolder, name: name, folder: files.join(root, name) })));
  return read.filter((p): p is DiscoveredPlan => p !== undefined);
}

/** The plans of each workspace folder, in the order of the folders and, within each, by name. */
export async function discover(files: Files, folders: string[]): Promise<DiscoveredPlan[]> {
  const perFolder = await Promise.all(folders.map((p) => plansOfFolder(files, p)));
  return perFolder.flat();
}

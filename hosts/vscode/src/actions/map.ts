// Map a `.md`: which workspace folder it is in, the relative path the skill receives, and whether that
// file already produced a plan (the `source` of a `plan.json`). Pure: the plans arrive already discovered.
import { isAbsolute, posix, relative, sep } from 'node:path';
import { stringsFor, type Strings } from '@plan-relay/i18n';

export interface PlanWithOrigin {
  workspaceFolder: string;
  name: string;
  /** Absolute path of the plan folder. */
  folder: string;
  /** `source` of `plan.json`: relative to the project root; `null` when the plan came from the conversation. */
  origin: string | null;
}

export interface MapTarget<P extends PlanWithOrigin = PlanWithOrigin> {
  workspaceFolder: string;
  /** Relative to the workspace folder, with `/`, capitalization as on disk. */
  relativePath: string;
  existing: P | undefined;
}

/** Path of `md` relative to `folder`, or `undefined` when it is not inside it. */
function relativeInside(folder: string, md: string): string | undefined {
  const rel = relative(folder, md);
  if (rel === '' || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) return undefined;
  return rel.split(sep).join('/');
}

/**
 * The target of "Create tasks from this plan" for the `.md` (absolute path): the workspace folder that contains it
 * (the deepest, when folders are nested), the relative path and the plan of that folder whose `origin` is
 * that path. With no folder that contains it, `undefined`. The comparison is exact: capitalization is not normalized.
 */
export function mapTarget<P extends PlanWithOrigin>(md: string, folders: string[], plans: P[]): MapTarget<P> | undefined {
  let best: { folder: string; rel: string } | undefined;
  for (const folder of folders) {
    const rel = relativeInside(folder, md);
    if (rel !== undefined && (!best || rel.length < best.rel.length)) best = { folder, rel };
  }
  if (!best) return undefined;
  const { folder, rel } = best;
  const existing = plans.find((p) => p.workspaceFolder === folder && p.origin !== null && posix.normalize(p.origin) === rel);
  return { workspaceFolder: folder, relativePath: rel, existing };
}

/** What matters about a plan's state before deleting it. */
export interface RunningWork {
  running: number;
  runOpen: boolean;
}

export interface PlanNotice {
  /** Work is running (or unknown): the modal must say so. */
  strong: boolean;
  text: string;
  detail: string;
}

function tasks(n: number, t: Strings['t']): string {
  return n === 1 ? t('notice.oneTask') : t('notice.tasks', n);
}

/**
 * The modal text before deleting a plan, for "Create tasks" of a `.md` that already produced a plan (`map`) or
 * for "Delete" on the card (`delete`). Strong when there are tasks in progress, an autopilot run open, or
 * when the state was not read.
 */
export function planNotice(
  name: string,
  action: 'map' | 'delete',
  status: RunningWork | undefined,
  strings: Strings = stringsFor(),
): PlanNotice {
  const { t } = strings;
  const text = action === 'map' ? t('notice.alreadyHasPlan', name) : t('notice.deletePlan', name);
  const trash = t('notice.trash', name);
  if (status === undefined) return { strong: true, text, detail: t('notice.statusUnreadable', trash) };
  const running: string[] = [];
  if (status.running > 0) running.push(tasks(status.running, t));
  if (status.runOpen) running.push(t('notice.runOpen'));
  if (running.length === 0) return { strong: false, text, detail: trash };
  const list = running.length === 1 ? (running[0] ?? '') : t('notice.and', running[0] ?? '', running[1] ?? '');
  return { strong: true, text, detail: t('notice.workRunning', list, trash) };
}

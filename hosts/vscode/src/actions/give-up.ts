// Give up a task and reopen a give-up from the panel, with injected dependencies so the flow can be tested without
// `vscode`. The graph, the refusals and the new text are the pure functions of core/reader; this module re-reads
// the plan, shows the confirmation with the reason, re-reads again and writes all files or none.
// The extension does not run task.sh: it writes in TypeScript, straight to disk, like "Delete" on a plan.
import { randomBytes } from 'node:crypto';
import { rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringsFor, type Strings } from '@plan-relay/i18n';
import { errorText as readerErrorText, type ConfirmationData } from '@plan-relay/panel';
import {
  giveUp,
  giveUpClosure,
  readStatus,
  reopen,
  reopenClosure,
  type Files,
  type PlanStatus,
  type Refusal,
  type TaskStatus,
  type Write,
} from '@plan-relay/reader';
import { LockBusy, LockLost, type HeldLocks } from './task-lock';
import { errorMessage } from '../util';

/** The whole plan, unfiltered, and the text of each task by `file` (relative to the plan folder). */
export interface PlanToEdit {
  status: PlanStatus;
  strings: Map<string, string>;
}

/** Reads the unfiltered state and the text of each task; a task that vanished between the two reads is an error. */
export async function readPlanToEdit(
  files: Files,
  folder: string,
  strings: Strings = stringsFor(),
): Promise<PlanToEdit | { error: string }> {
  const readValue = await readStatus(files, folder);
  if ('error' in readValue) return { error: readerErrorText(readValue.error, strings) };
  const mapAction = new Map<string, string>();
  for (const t of readValue.tasks) {
    const text = await files.read(files.join(folder, t.file));
    if (text === undefined) return { error: t.file };
    mapAction.set(t.file, text);
  }
  return { status: readValue, strings: mapAction };
}

/** The "Reopen" modal: the highlighted title, the detail (plain text) and the label of the button that applies. */
export interface Confirmation {
  text: string;
  detail: string;
  button: string;
}

export interface EditDeps {
  /** The plan folder: the second argument of `task.notFound`. */
  folder: string;
  /** Re-reads the plan now, not from the panel's last refresh. */
  read(): Promise<PlanToEdit | { error: string }>;
  /**
   * The give-up confirmation with the graph and the reason (in VS Code, the tab of `confirmation.ts`): returns the
   * "Abandon" reason, or `undefined` to go back. The default is to go back; whoever shows it validates it with `isValidReason`.
   */
  confirmGiveUp(data: ConfirmationData): Promise<string | undefined>;
  /** The "Reopen" confirmation (modal); `true` only with the button that applies. */
  confirm(c: Confirmation): Promise<boolean>;
  /** Of the given files (relative to the plan folder), those with unsaved changes in an editor. */
  dirty(files: readonly string[]): string[];
  /**
   * Takes the task lock of each id, in the order given (`takeLocks` in VS Code). Rejects with `LockBusy` when one
   * stays held. Every write goes under these locks, like task.sh.
   */
  lock(ids: readonly string[]): Promise<HeldLocks>;
  /**
   * Writes all or none; `before` is the text read from each, to undo a failure midway; `stillOwned` is asked before
   * each rename (`writeAll`). Rejects on failure.
   */
  writeFiles(
    files: ReadonlyMap<string, string>,
    before: ReadonlyMap<string, string>,
    stillOwned: (rel: string) => Promise<boolean>,
  ): Promise<void>;
  requestLoad(): void;
  alert(text: string): void;
  inform(text: string): void;
  /**
   * Whether the `taskAbandoned` notification is on right now. When on, it already announces the give-up, and the
   * host does not repeat the success notice: a cascade is a single notice.
   */
  notifiesGiveUp(): boolean;
  channel: { info(text: string): void; warn(text: string): void };
  strings?: Strings;
}

export type GiveUpEnd = 'applied' | 'cancelled' | 'refused' | 'changed' | 'error';
export type ReopenEnd = 'reopened' | 'cancelled' | 'refused' | 'changed' | 'error';

/** The text of a reader refusal; `task.notFound` gets the plan folder, which belongs to the host. */
export function refusalText(r: Refusal, folder: string, strings: Strings): string {
  return r.key === 'task.notFound' ? strings.t(r.key, ...r.args, folder) : strings.t(r.key, ...r.args);
}

/** The `## Log` lines go in the plan's language (`language` in plan.json), not the interface's. */
function writeInLanguage(language: string): Write {
  const { t } = stringsFor(language);
  return (key, ...args) => t(key, ...args);
}

/** The phase titles by `dir`, for the confirmation. */
function phaseTitles(phases: PlanStatus['phases']): Record<string, string> {
  return Object.fromEntries(phases.map((f) => [f.dir, f.title]));
}

function reopenConfirmation(returning: readonly TaskStatus[], strings: Strings): Confirmation {
  const { t } = strings;
  const rootId = returning[0]?.id ?? '';
  const more = returning.length - 1;
  const text = more === 0 ? t('reopen.titleOnly', rootId) : more === 1 ? t('reopen.titleOne', rootId) : t('reopen.title', rootId, more);
  const lines = returning.map((v) => `${v.id} — ${v.title}`);
  return {
    text,
    detail: [t('reopen.detail'), ...lines].join('\n'),
    button: returning.length === 1 ? t('reopen.buttonOnly') : t('reopen.button', returning.length),
  };
}

/** "<ID> abandonada", "… com mais 1 task" or "… com mais 5 tasks": `total` counts the root. */
function giveUpText(id: string, total: number, { t }: Strings): string {
  const more = total - 1;
  if (more === 0) return t('giveup.doneOnly', id);
  return more === 1 ? t('giveup.doneWithOneMore', id) : t('giveup.doneWithMore', id, more);
}

/** "<ID> retomada", "… com mais 1 task" or "… com mais 5 tasks": `total` counts the root. */
function reopenText(id: string, total: number, { t }: Strings): string {
  const more = total - 1;
  if (more === 0) return t('reopen.doneOnly', id);
  return more === 1 ? t('reopen.doneOne', id) : t('reopen.done', id, more);
}

/** The IDs of the given files, for the messages. */
function idsOf(tasks: readonly TaskStatus[], files: readonly string[]): string {
  return files.map((a) => tasks.find((t) => t.file === a)?.id ?? a).join(', ');
}

/**
 * Re-reads, checks that nothing changed and writes. `same` compares what was shown to the owner with what is
 * computed now; the new text comes from the fresh read (another session may have written to a task body without
 * changing the graph).
 */
async function rewrite<R extends 'applied' | 'reopened'>(
  verb: string,
  id: string,
  ok: R,
  compute: (p: PlanToEdit) => { refusal: Refusal } | { files: Map<string, string>; same: boolean },
  deps: EditDeps,
): Promise<R | 'changed' | 'error' | 'refused'> {
  const strings = deps.strings ?? stringsFor();
  const { t } = strings;
  const log = (r: string) => deps.channel.info(t('log.edit', verb, id, deps.folder, r));
  const failed = (text: string) => {
    log(text);
    deps.alert(t('notice.brand', t('edit.failed', text)));
    return 'error' as const;
  };
  const busy = (lockId: string) => {
    const text = t('task.lockBusy', lockId, deps.folder, `.lock-${lockId}`);
    log(text);
    deps.alert(t('notice.brand', text));
    return 'refused' as const;
  };
  // Which locks (contract, "Lock"): first, without locks, the tasks that would change; a refusal still takes the
  // task's own lock, so it is given under it. Then everything again under the locks, taken in plan order.
  const planned = await deps.read();
  if ('error' in planned) return failed(planned.error);
  const first = compute(planned);
  const ids = 'refusal' in first ? [id] : planned.status.tasks.filter((x) => first.files.has(x.file)).map((x) => x.id);
  let locks: HeldLocks;
  try {
    locks = await deps.lock(ids);
  } catch (e) {
    return e instanceof LockBusy ? busy(e.id) : failed(errorMessage(e));
  }
  try {
    return await rewriteLocked(ok, compute, deps, ids, locks, { log, failed, busy });
  } finally {
    await locks.release();
  }
}

async function rewriteLocked<R extends 'applied' | 'reopened'>(
  ok: R,
  compute: (p: PlanToEdit) => { refusal: Refusal } | { files: Map<string, string>; same: boolean },
  deps: EditDeps,
  ids: readonly string[],
  locks: HeldLocks,
  say: { log: (r: string) => void; failed: (text: string) => 'error'; busy: (lockId: string) => 'refused' },
): Promise<R | 'changed' | 'error' | 'refused'> {
  const strings = deps.strings ?? stringsFor();
  const { t } = strings;
  const { log } = say;
  const readValue = await deps.read();
  if ('error' in readValue) return say.failed(readValue.error);
  const r = compute(readValue);
  if ('refusal' in r) {
    const text = refusalText(r.refusal, deps.folder, strings);
    log(text);
    // The reason is the only refusal that does not come from the plan: it comes from what the owner wrote.
    if (r.refusal.key === 'task.invalidReason') {
      deps.alert(t('notice.brand', text));
      return 'refused';
    }
    deps.alert(t('notice.brand', t('giveup.changed', text)));
    return 'changed';
  }
  if (!r.same) {
    log('changed');
    deps.alert(t('notice.brand', t('giveup.changed', t('giveup.graphChanged'))));
    return 'changed';
  }
  // A task to change whose lock is not held: the set grew since the locks were taken (a claim landed in between).
  const tasks = readValue.status.tasks;
  const grew = tasks.find((x) => r.files.has(x.file) && !ids.includes(x.id));
  if (grew) return say.busy(grew.id);
  const dirty = deps.dirty([...r.files.keys()]);
  if (dirty.length) {
    deps.alert(t('notice.brand', t('edit.notSaved', idsOf(tasks, dirty))));
    return 'refused';
  }
  // The files in plan order, which is the order of the renames; before each one, the lock must still be ours.
  const inOrder = new Map(tasks.filter((x) => r.files.has(x.file)).map((x) => [x.file, r.files.get(x.file) as string]));
  const idOf = (rel: string) => tasks.find((x) => x.file === rel)?.id ?? rel;
  try {
    await deps.writeFiles(inOrder, readValue.strings, (rel) => locks.owns(idOf(rel)));
  } catch (e) {
    let end: 'error' | 'refused';
    if (e instanceof LockLost) end = say.busy(idOf(e.rel));
    else if (e instanceof RewriteStuck) {
      // The restores that failed go to the output channel; the notice names the state of each file.
      for (const [rel, why] of e.errors) deps.channel.warn(t('log.restoreFailed', idOf(rel), why));
      const lines = [...e.states].map(([rel, s]) => t(STATE_KEY[s], idOf(rel)));
      end = say.failed([t('task.rewriteStuck', idOf(e.rel)), ...lines].join('\n'));
    } else if (e instanceof RewriteFailed) {
      deps.channel.warn(e.message);
      end = say.failed(t('task.rewriteFailed', idOf(e.rel)));
    } else end = say.failed(errorMessage(e));
    deps.requestLoad();
    return end;
  }
  log([...r.files.keys()].join(', '));
  deps.requestLoad();
  return ok;
}

/** "Give up" on a task: re-reads, refuses or confirms with the graph, asks for the reason, re-reads and writes. */
export async function giveUpTask(id: string, deps: EditDeps): Promise<GiveUpEnd> {
  const strings = deps.strings ?? stringsFor();
  const { t } = strings;
  const readValue = await deps.read();
  if ('error' in readValue) {
    deps.alert(t('notice.brand', t('edit.failed', readValue.error)));
    return 'error';
  }
  const preview = giveUpClosure(readValue.status.tasks, id);
  if ('refusal' in preview) {
    deps.alert(t('notice.brand', refusalText(preview.refusal, deps.folder, strings)));
    return 'refused';
  }
  // Before the confirmation: no point in the owner reading the graph and writing a reason only for the write to be refused.
  const dirty = deps.dirty(preview.falls.map((q) => readValue.status.tasks.find((x) => x.id === q.id)?.file ?? ''));
  if (dirty.length) {
    deps.alert(t('notice.brand', t('edit.notSaved', idsOf(readValue.status.tasks, dirty))));
    return 'refused';
  }
  const reason = await deps.confirmGiveUp({ preview, phases: phaseTitles(readValue.status.phases) });
  if (reason === undefined) return 'cancelled';
  const shown = JSON.stringify(preview);
  const finished = await rewrite(
    'giveup',
    id,
    'applied',
    (p) => {
      const now = giveUpClosure(p.status.tasks, id);
      if ('refusal' in now) return now;
      const r = giveUp(p.status.tasks, p.strings, id, reason, writeInLanguage(p.status.language));
      return 'refusal' in r ? r : { files: r.files, same: JSON.stringify(now) === shown };
    },
    deps,
  );
  if (finished === 'applied' && !deps.notifiesGiveUp()) {
    deps.inform(t('notice.brand', giveUpText(id, preview.falls.length, strings)));
  }
  return finished;
}

/** "Reopen" on the root of a give-up: confirms what comes back, re-reads and writes. */
export async function reopenTask(id: string, deps: EditDeps): Promise<ReopenEnd> {
  const strings = deps.strings ?? stringsFor();
  const { t } = strings;
  const readValue = await deps.read();
  if ('error' in readValue) {
    deps.alert(t('notice.brand', t('edit.failed', readValue.error)));
    return 'error';
  }
  const returning = reopenClosure(readValue.status.tasks, id);
  if ('refusal' in returning) {
    deps.alert(t('notice.brand', refusalText(returning.refusal, deps.folder, strings)));
    return 'refused';
  }
  if (!(await deps.confirm(reopenConfirmation(returning, strings)))) return 'cancelled';
  const shown = returning.map((v) => v.id).join(',');
  const finished = await rewrite(
    'reopen',
    id,
    'reopened',
    (p) => {
      const now = reopenClosure(p.status.tasks, id);
      if ('refusal' in now) return now;
      const r = reopen(p.status.tasks, p.strings, id, writeInLanguage(p.status.language));
      return 'refusal' in r ? r : { files: r.files, same: now.map((v) => v.id).join(',') === shown };
    },
    deps,
  );
  // "Reopen" has no notification: it always notifies.
  if (finished === 'reopened') deps.inform(t('notice.brand', reopenText(id, returning.length, strings)));
  return finished;
}

/** The disk that `writeAll` uses; the default is `node:fs`. */
export interface WriteFs {
  write(path: string, text: string): Promise<void>;
  renameFile(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
}

const NODE_FS: WriteFs = {
  write: (c, t) => writeFile(c, t, 'utf8'),
  renameFile: (from, to) => rename(from, to),
  remove: (c) => unlink(c),
};

/**
 * Writes all files or none, like task.sh: first a temporary file next to each one (a failure here deletes the
 * temporaries and nothing changed); then the renames, in the order of `files`. A rename that fails midway restores,
 * with `before`, the text of those that had already changed. Before each rename, `stillOwned` must say the file's
 * task lock is still this writer's; if not, it stops with `LockLost`, removes the remaining temporaries and writes
 * nothing more.
 */
export async function writeAll(
  folder: string,
  files: ReadonlyMap<string, string>,
  fs: WriteFs = NODE_FS,
  before: ReadonlyMap<string, string> = new Map(),
  stillOwned: (rel: string) => Promise<boolean> = () => Promise.resolve(true),
): Promise<void> {
  const suffix = `.plan-relay-${randomBytes(4).toString('hex')}.tmp`;
  const pairs = [...files].map(([rel, text]) => ({ destination: join(folder, rel), temp: join(folder, rel) + suffix, rel, text }));
  const written: string[] = [];
  try {
    for (const p of pairs) {
      await fs.write(p.temp, p.text);
      written.push(p.temp);
    }
  } catch (e) {
    await Promise.allSettled(written.map((c) => fs.remove(c)));
    throw e;
  }
  const doneItems: typeof pairs = [];
  try {
    for (const p of pairs) {
      if (!(await stillOwned(p.rel))) throw new LockLost(p.rel);
      await fs.renameFile(p.temp, p.destination);
      doneItems.push(p);
    }
  } catch (e) {
    // A lock that is no longer ours: another writer may be at work, so nothing more is written, not even the restores.
    if (e instanceof LockLost) {
      await Promise.allSettled(pairs.filter((p) => !doneItems.includes(p)).map((p) => fs.remove(p.temp)));
      throw e;
    }
    // Each file already replaced goes back to the text it had, through a temporary and a rename.
    const states = new Map<string, FileState>();
    const errors = new Map<string, string>();
    for (const p of doneItems) {
      const oldItem = before.get(p.rel);
      // Without the text read before, there is nothing to put back: the file stays replaced, with no error to report.
      if (oldItem === undefined) {
        states.set(p.rel, 'replaced');
        continue;
      }
      try {
        await fs.write(p.temp, oldItem);
        await fs.renameFile(p.temp, p.destination);
        states.set(p.rel, 'restored');
      } catch (restoreError) {
        await Promise.allSettled([fs.remove(p.temp)]);
        states.set(p.rel, 'replaced');
        errors.set(p.rel, errorMessage(restoreError));
      }
    }
    await Promise.allSettled(pairs.filter((p) => !doneItems.includes(p)).map((p) => fs.remove(p.temp)));
    const failedRel = pairs[doneItems.length]?.rel ?? '';
    for (const p of pairs.slice(doneItems.length)) states.set(p.rel, 'untouched');
    throw [...states.values()].includes('replaced')
      ? new RewriteStuck(failedRel, errorMessage(e), states, errors)
      : new RewriteFailed(failedRel, errorMessage(e));
  }
}

/** The state a file was left in when a multi-file write failed: replaced, restored or untouched. */
export type FileState = 'replaced' | 'restored' | 'untouched';

const STATE_KEY = { replaced: 'task.stateReplaced', restored: 'task.stateRestored', untouched: 'task.stateUntouched' } as const;

/** A rename failed and every file already replaced was put back: nothing changed. `rel` is the file that failed. */
export class RewriteFailed extends Error {
  constructor(
    readonly rel: string,
    reason: string,
  ) {
    super(reason);
    this.name = 'RewriteFailed';
  }
}

/** A rename failed and putting back a file failed too: `states` says what each file was left as, `errors` why the restores failed. */
export class RewriteStuck extends Error {
  constructor(
    readonly rel: string,
    reason: string,
    readonly states: ReadonlyMap<string, FileState>,
    readonly errors: ReadonlyMap<string, string>,
  ) {
    super(reason);
    this.name = 'RewriteStuck';
  }
}

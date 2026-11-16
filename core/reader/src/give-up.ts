// Cancel, give up and reopen (core/contract/contract.md, «Cancel, give up and reopen»): the graph,
// the refusals and the reason, as pure functions over the tasks of the whole plan (no filter), in the
// contract order — that of `readStatus().tasks`. The reference implementation is the template's task.sh; the cases
// of core/contract/conformance/edits/ and reasons.json check the two (conformance.test.ts).
// The new text of the files lives in edit.ts.

/** What the graph reads from each task; `TaskStatus` has all of this. */
export interface GraphTask {
  id: string;
  title: string;
  status: string;
  blocked_by: readonly string[];
  /** Path relative to the plan folder; the phase folder is the first segment. */
  file: string;
  replaced_by?: string;
  given_up_by?: string;
  given_up_with?: string;
}

/** The keys of the verb texts (core/i18n, area `task.`; table in conformance/edits/README.md). */
export type RefusalKey =
  | 'task.notFound'
  | 'task.ambiguousId'
  | 'task.invalidReason'
  | 'task.cancelOnlyLive'
  | 'task.invalidReplacement'
  | 'task.cancelHasDependents'
  | 'task.giveupOnlyReadyOrDraft'
  | 'task.giveupStuck'
  | 'task.reopenOnlyAbandoned'
  | 'task.reopenAtRoot';

/**
 * A refusal: the key of the text and the arguments, as data (the host translates). `task.notFound` takes only
 * the ID: the second argument of the text, the plan folder, belongs to the caller.
 */
export interface Refusal {
  key: RefusalKey;
  args: string[];
}

/** A task of the give-up preview, as in `task.sh giveup --json`. */
export interface GiveUpFall {
  id: string;
  title: string;
  status: string;
  phase: string;
  parent: string | null;
  depth: number;
  also_depends_on: string[];
}

/** The preview of `task.sh giveup <ID> --json`: the object that the panel draws in the confirmation. */
export interface GiveUpPreview {
  root: string;
  /** The tree in pre-order: the root, then each child followed by its subtree. */
  falls: GiveUpFall[];
  abandoned_phases: string[];
}

const OUT = new Set(['cancelled', 'abandoned']);

/** Alive: any status other than `cancelled` and `abandoned` (`done` and invalid included). */
export function isAlive(status: string): boolean {
  return !OUT.has(status);
}

function phaseOf(t: GraphTask): string {
  const slash = t.file.indexOf('/');
  return slash < 0 ? '' : t.file.slice(0, slash);
}

/**
 * The refusal for an id that more than one file has (a duplicated id): the id and its files in plan order.
 * No verb changes such a task until the files are renamed.
 */
function ambiguous(tasks: readonly GraphTask[], id: string): Refusal | undefined {
  const files = tasks.filter((t) => t.id === id).map((t) => t.file);
  return files.length > 1 ? { key: 'task.ambiguousId', args: [id, files.join(', ')] } : undefined;
}

/** The tasks whose `Blocked by:` cites `id`, in plan order. */
export function dependents<T extends GraphTask>(tasks: readonly T[], id: string): T[] {
  return tasks.filter((t) => t.blocked_by.includes(id));
}

/** The live dependents of `id`, in plan order: a task is cancelled only with none. */
export function canCancel(tasks: readonly GraphTask[], id: string): string[] {
  return [
    ...new Set(
      dependents(tasks, id)
        .filter((t) => isAlive(t.status))
        .map((t) => t.id),
    ),
  ];
}

const WHITESPACE = /[ \t\n\r]+/g;

/** The normalized reason: no whitespace (space, tab, LF, CR) at the ends, and each inner run becomes one space. */
export function normalizeReason(text: string): string {
  return text.replace(WHITESPACE, ' ').replace(/^ /, '').replace(/ $/, '');
}

/** Valid when, normalized, it is not empty and some word has more than one distinct character (code points). */
export function isValidReason(text: string): boolean {
  const m = normalizeReason(text);
  return m !== '' && m.split(' ').some((word) => new Set(Array.from(word)).size > 1);
}

/** The refusal of `cancel`, in contract order, or `undefined` when it can be cancelled. */
export function cancelRefusal(
  tasks: readonly GraphTask[],
  id: string,
  replacement: string | undefined,
  reason: string,
): Refusal | undefined {
  const task = tasks.find((t) => t.id === id);
  if (!task) return { key: 'task.notFound', args: [id] };
  const twin = ambiguous(tasks, id);
  if (twin) return twin;
  if (!['draft', 'ready', 'in-progress'].includes(task.status)) return { key: 'task.cancelOnlyLive', args: [id, task.status] };
  if (replacement !== undefined) {
    const other = tasks.find((t) => t.id === replacement);
    if (!other || other.id === id || !isAlive(other.status)) return { key: 'task.invalidReplacement', args: [id, replacement] };
  }
  const alive = canCancel(tasks, id);
  if (alive.length > 0) return { key: 'task.cancelHasDependents', args: [id, alive.join(', ')] };
  if (!isValidReason(reason)) return { key: 'task.invalidReason', args: [] };
  return undefined;
}

/**
 * Abandoned phase: every task is `cancelled` or `abandoned` and at least one is `abandoned`. Looks at the whole
 * phase; `status` gives the status of each task (the current one, or the one after a give-up).
 */
function abandonedPhases(tasks: readonly GraphTask[], status: (t: GraphTask) => string): Set<string> {
  const alive = new Set<string>();
  const withAbandoned = new Set<string>();
  for (const t of tasks) {
    const s = status(t);
    if (isAlive(s)) alive.add(phaseOf(t));
    else if (s === 'abandoned') withAbandoned.add(phaseOf(t));
  }
  return new Set([...withAbandoned].filter((f) => !alive.has(f)));
}

/**
 * What falls when giving up `id`: the root and the closure of the dependents, breadth-first (the parent is the first task
 * that reaches the child; each task enters once, so a cycle does not hang). A `cancelled` or
 * `abandoned` dependent does not enter and the closure does not pass through it. Refuses a duplicated root id, the root
 * outside `ready`/`draft`, a task of the closure whose id is duplicated and, then, any task of the closure outside
 * `ready`/`draft`, named in the order of `falls`.
 */
export function giveUpClosure(tasks: readonly GraphTask[], id: string): GiveUpPreview | { refusal: Refusal } {
  const root = tasks.find((t) => t.id === id);
  if (!root) return { refusal: { key: 'task.notFound', args: [id] } };
  const twin = ambiguous(tasks, id);
  if (twin) return { refusal: twin };
  if (root.status !== 'ready' && root.status !== 'draft')
    return { refusal: { key: 'task.giveupOnlyReadyOrDraft', args: [id, root.status] } };

  // Breadth-first: who enters, through which parent, and the children of each in plan order.
  const parent = new Map<string, string | null>([[root.id, null]]);
  const children = new Map<string, GraphTask[]>();
  const queue: GraphTask[] = [root];
  for (const current of queue) {
    const its: GraphTask[] = [];
    for (const d of dependents(tasks, current.id)) {
      if (parent.has(d.id) || !isAlive(d.status)) continue;
      parent.set(d.id, current.id);
      its.push(d);
      queue.push(d);
    }
    children.set(current.id, its);
  }

  // Pre-order.
  const inOrder: { t: GraphTask; depth: number }[] = [];
  const visit = (t: GraphTask, depth: number) => {
    inOrder.push({ t, depth });
    for (const f of children.get(t.id) ?? []) visit(f, depth + 1);
  };
  visit(root, 0);

  for (const { t } of inOrder.slice(1)) {
    const fallingTwin = ambiguous(tasks, t.id);
    if (fallingTwin) return { refusal: fallingTwin };
  }
  const blocking = inOrder.filter(({ t }) => t !== root && t.status !== 'ready' && t.status !== 'draft');
  if (blocking.length > 0) {
    return { refusal: { key: 'task.giveupStuck', args: [id, blocking.map(({ t }) => `${t.id} (${t.status})`).join(', ')] } };
  }

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const falls: GiveUpFall[] = inOrder.map(({ t, depth }) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    phase: phaseOf(t),
    parent: parent.get(t.id) ?? null,
    depth,
    also_depends_on:
      t === root
        ? []
        : t.blocked_by.filter((b) => {
            const other = byId.get(b);
            return other !== undefined && !parent.has(b) && other.status !== 'done' && isAlive(other.status);
          }),
  }));

  const before = abandonedPhases(tasks, (t) => t.status);
  const after = abandonedPhases(tasks, (t) => (parent.has(t.id) ? 'abandoned' : t.status));
  const phases: string[] = [];
  for (const t of tasks) {
    const f = phaseOf(t);
    if (after.has(f) && !before.has(f) && !phases.includes(f)) phases.push(f);
  }
  return { root: root.id, falls, abandoned_phases: phases };
}

/**
 * What comes back when reopening `id`: the root and the `abandoned` tasks with `Given up with: <id>`, in plan
 * order after the root. Refuses a duplicated root id, the one that is not `abandoned`, the one that fell with
 * another root, and a group with a task whose id is duplicated.
 */
export function reopenClosure<T extends GraphTask>(tasks: readonly T[], id: string): T[] | { refusal: Refusal } {
  const root = tasks.find((t) => t.id === id);
  if (!root) return { refusal: { key: 'task.notFound', args: [id] } };
  const twin = ambiguous(tasks, id);
  if (twin) return { refusal: twin };
  if (root.status !== 'abandoned') return { refusal: { key: 'task.reopenOnlyAbandoned', args: [id, root.status] } };
  if (root.given_up_with) return { refusal: { key: 'task.reopenAtRoot', args: [id, root.given_up_with] } };
  const fellWith = tasks.filter((t) => t !== root && t.status === 'abandoned' && t.given_up_with === id);
  for (const t of fellWith) {
    const backTwin = ambiguous(tasks, t.id);
    if (backTwin) return { refusal: backTwin };
  }
  return [root, ...fellWith];
}

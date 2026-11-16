// What the panel shows for each plan, derived from the loaded status. Pure.
import { minutesBetween } from './duration';
import type { TaskGroup, IdeaInput, TaskTier, PlanInput, TaskInput } from './input';
import { errorText } from './error';
import { decideBadge, type Badge } from './badge';
import { stringsFor, type Strings } from '@plan-relay/i18n';

/** A task of the plan, with everything the reader delivers and what the view derives. */
export interface TaskView {
  id: string;
  title: string;
  /** Relative to the plan folder. */
  file: string;
  group: TaskGroup;
  type: string;
  track: string;
  tier: TaskTier;
  repos: string[];
  /** The task `Blocked by:`. */
  blockedBy: string[];
  /** The contract `waiting_on`: what is still missing, only on `blocked` tasks. */
  waitingOn: string[];
  /** The tasks that cite this one in `Blocked by:` (all of them, including the finished ones), in plan order. */
  unblocks: string[];
  /** The contract `unblocks`: how many of the tasks waiting on this one are not yet done or cancelled. */
  pendingUnblocks: number;
  started: string | null;
  finished: string | null;
  nextStep: string | null;
  /** The phase `dir` (the first folder of `file`). */
  phase: string;
  /** 0 on a task, 1 on a subtask, 2 on a subtask of a subtask. */
  depth: number;
  /** Minutes from start to finish, or until now on an in-progress task; `null` without a valid start. */
  duration: number | null;
  /** The replaced cancelled task: the task that took its place (`Replaced by:`). */
  replacement?: string;
  /** The abandoned task that fell with another (`Given up with:`): the root of the give-up. */
  giveUpRoot?: string;
  /** The root of an owner give-up (`Given up by: owner`). */
  ownerGiveUp?: true;
}

/** How many tasks there are in each group (only the groups present). */
export type CountByGroup = Partial<Record<TaskGroup, number>>;

export interface PhaseView {
  title: string;
  done: number;
  total: number;
  pct: number;
  /** The phase folder, relative to the plan folder. */
  dir: string;
  inProgress: number;
  /** No task outside `cancelled` and `abandoned`, and no `done` after a give-up. */
  abandoned: boolean;
  counts: CountByGroup;
  /** The tasks of the phase, in plan order. */
  tasks: TaskView[];
}

export interface PlanView {
  /** The plan folder: identifies the card and the plan in messages. */
  id: string;
  name: string;
  badge?: Badge;
  pct: number;
  done: number;
  total: number;
  phases: PhaseView[];
  /** All the tasks of the plan, from every group, in plan order. */
  tasks: TaskView[];
  /** The contract `parallel`: IDs that can run at the same time right now. */
  parallel: string[];
  /** The log of the open or the last run, relative to the plan folder. */
  log?: string;
  /** A run is open (`run.open`): the pill on the card. Absent without `run`. */
  runOpen?: boolean;
  error?: string;
}

/**
 * What the host handles for ideas: refine, create the tasks (map) and open the file of an idea; and, on the
 * folder card, create a new idea (`new`) and show the `agent_plans/_ideas/` folder (`folder`).
 */
export type IdeaAction = 'refine' | 'map' | 'open' | 'new' | 'folder';
export const IDEA_ACTIONS: readonly IdeaAction[] = ['refine', 'map', 'open', 'new', 'folder'];

export interface IdeaView {
  /** The idea file: identifies it in messages. */
  id: string;
  title: string;
  status: IdeaInput['status'];
  /** `null`: unknown. */
  questions: number | null;
  /** The plan the idea produced; only in `mapped`. */
  plan?: string;
}

/** The «Ideas» section: the ideas and the actions the host handles (each host says which). */
export interface IdeasView {
  items: IdeaView[];
  actions: IdeaAction[];
}

/** The view of the ideas, in the order they came. */
export function ideasView(ideas: readonly IdeaInput[], actions: readonly IdeaAction[]): IdeasView {
  return {
    actions: [...actions],
    items: ideas.map((i) => ({
      id: i.file,
      title: i.title,
      status: i.status,
      questions: i.openQuestions,
      ...(i.status === 'mapped' && i.plan ? { plan: i.plan } : {}),
    })),
  };
}

function percentage(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

/** 0 on a task, 1 on a subtask, 2 on a subtask of a subtask. */
export function depthOf(id: string): number {
  return id.split('.').length - 1;
}

/** The tasks of the plan with the view fields; `unblocks` is the inverse of `blocked_by`. */
function viewTasks(tasks: readonly TaskInput[], now: Date): TaskView[] {
  const unblocks = new Map<string, string[]>();
  for (const t of tasks) {
    for (const b of t.blocked_by) {
      const list = unblocks.get(b);
      if (list) list.push(t.id);
      else unblocks.set(b, [t.id]);
    }
  }
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    file: t.file,
    group: t.group,
    type: t.type,
    track: t.track,
    tier: t.tier,
    repos: [...t.repos],
    blockedBy: [...t.blocked_by],
    waitingOn: [...t.waiting_on],
    unblocks: unblocks.get(t.id) ?? [],
    pendingUnblocks: t.unblocks,
    started: t.started,
    finished: t.finished,
    nextStep: t.next_step,
    phase: t.file.split('/')[0] ?? '',
    depth: depthOf(t.id),
    duration:
      t.finished !== null ? minutesBetween(t.started, t.finished) : t.group === 'in-progress' ? minutesBetween(t.started, now) : null,
    ...(t.replaced_by ? { replacement: t.replaced_by } : {}),
    ...(t.given_up_with ? { giveUpRoot: t.given_up_with } : {}),
    ...(t.given_up_by === 'owner' ? { ownerGiveUp: true as const } : {}),
  }));
}

function countOf(tasks: readonly TaskView[]): CountByGroup {
  const c: CountByGroup = {};
  for (const t of tasks) c[t.group] = (c[t.group] ?? 0) + 1;
  return c;
}

/** The plan view, with the section titles and the durations in the language of `strings` (English without them). */
export function planView(plan: PlanInput, now: Date, strings: Strings = stringsFor()): PlanView {
  if ('error' in plan) {
    return {
      id: plan.folder,
      name: plan.name,
      pct: 0,
      done: 0,
      total: 0,
      phases: [],
      tasks: [],
      parallel: [],
      error: errorText(plan.error, strings),
    };
  }
  const { status } = plan;
  const tasks = viewTasks(status.tasks, now);
  const byPhase = new Map<string, TaskView[]>();
  for (const t of tasks) {
    const list = byPhase.get(t.phase);
    if (list) list.push(t);
    else byPhase.set(t.phase, [t]);
  }
  return {
    id: plan.folder,
    name: plan.name,
    badge: decideBadge(status),
    pct: status.progress.pct,
    done: status.progress.done,
    total: status.progress.total,
    phases: status.phases.map((f) => {
      const phaseTasks = byPhase.get(f.dir) ?? [];
      return {
        title: f.title,
        done: f.done,
        total: f.total,
        pct: percentage(f.done, f.total),
        dir: f.dir,
        inProgress: f.in_progress,
        abandoned: f.abandoned === true,
        counts: countOf(phaseTasks),
        tasks: phaseTasks,
      };
    }),
    tasks,
    parallel: [...status.parallel],
    ...(status.run ? { log: status.run.log, runOpen: status.run.open } : {}),
  };
}

/** A task of the «Now» tab. */
export interface NowItem {
  task: TaskView;
  /** Is in `parallel`: can run in another session at the same time. */
  parallel: boolean;
}

/** The slice of a plan in the «Now» tab: one card, with the sections that ask for action, uncut. */
export interface NowPlan {
  plan: PlanView;
  running: NowItem[];
  /** `owner` (decision or human), from the one that unblocks the most to the one that unblocks the least. */
  owner: NowItem[];
  /** `available`, in the same order. */
  available: NowItem[];
  /** The `blocked` ones, from the ones waiting on the fewest to the most: what unblocks next. */
  next: NowItem[];
}

/** What the «Now» tab shows, for all the plans. */
export interface NowView {
  /** Only the plans with something to show: first those with an owner task, then those with an available one, then the rest. */
  plans: NowPlan[];
  /**
   * With nothing in progress, available or the owner's in any plan read: `waiting` (there are blocked ones) or `done`.
   * `null` when there is something to do, or when no plan could be read.
   */
  empty: 'waiting' | 'done' | null;
}

/** The «Now» tab: per plan, in progress, the owner's, available and what unblocks next, in the order of the `plan` skill. */
export function nowView(plans: readonly PlanView[]): NowView {
  // `sort` is stable: a tie keeps the task order (and, below, the plan order).
  const byUnblocks = (a: NowItem, b: NowItem): number => b.task.pendingUnblocks - a.task.pendingUnblocks;
  const slices = plans
    .filter((p) => p.error === undefined)
    .map((p): NowPlan => {
      const items = (group: TaskGroup): NowItem[] =>
        p.tasks.filter((t) => t.group === group).map((task) => ({ task, parallel: p.parallel.includes(task.id) }));
      return {
        plan: p,
        running: items('in-progress'),
        owner: items('owner').sort(byUnblocks),
        available: items('available').sort(byUnblocks),
        next: items('blocked').sort((a, b) => a.task.waitingOn.length - b.task.waitingOn.length),
      };
    });
  const size = (r: NowPlan): number => r.running.length + r.owner.length + r.available.length + r.next.length;
  const priority = (r: NowPlan): number => (r.owner.length > 0 ? 0 : r.available.length > 0 ? 1 : 2);
  const withContent = slices.filter((r) => size(r) > 0).sort((a, b) => priority(a) - priority(b));
  const action = slices.some((r) => r.running.length + r.owner.length + r.available.length > 0);
  const empty = action || slices.length === 0 ? null : slices.some((r) => r.next.length > 0) ? 'waiting' : 'done';
  return { plans: withContent, empty };
}

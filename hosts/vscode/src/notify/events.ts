// The events between two loads of the plans: task started, finished, waiting on owner, cancelled or abandoned;
// run opened or closed. Pure function, no VS Code; the alerts start from here.
import type { Strings } from '@plan-relay/i18n';
import type { Run, PlanStatus, TaskStatus } from '../plans/contract';
import type { LoadedPlan } from '../plans/load';

/** The task event types; the names are those of the `planRelay.notifications.*` settings. */
export type TaskEventType = 'taskStarted' | 'taskCompleted' | 'taskWaitingOnOwner' | 'taskCancelled' | 'taskAbandoned';
export type RunEventType = 'runOpened' | 'runClosed' | 'handoff';
export type EventType = TaskEventType | RunEventType;

interface Base {
  /** The plan name (the folder under `agent_plans/`). */
  plan: string;
  /** The plan folder, which identifies it among workspace folders. */
  folder: string;
}

export interface EventTask {
  id: string;
  title: string;
}

/** What only some task event types carry. */
interface Detail {
  /** Only on `taskWaitingOnOwner`: the rest of the `Next step:` line. */
  action?: string;
  /** Only on `taskCancelled`, when the task has `Replaced by:`: the ID of the replacement. */
  replacement?: string;
  /** Only on `taskAbandoned`: how many tasks fell with this root in the same load (those whose `Given up with:` equals it). */
  together?: number;
}

export type NotifyEvent =
  | (Base & EventTask & Detail & { type: TaskEventType })
  | (Base & { type: TaskEventType; /** Burst above the limit: a single event, with the tasks. */ tasks: EventTask[] })
  | (Base & { type: 'runOpened' | 'runClosed'; log: string })
  /** The conductor handed off: `handoff` is the stamp of the `## Handoff` (`run.handoff`); it is never aggregated. */
  | (Base & { type: 'handoff'; log: string; handoff: string });

/** More than this, of the same type and in the same plan in one load, becomes an aggregated event. */
export const AGGREGATION_LIMIT = 3;

/** The marker of the worker that stopped (`RESULT: BLOCKED` or `WAITING-ON-OWNER`); it is a contract, so it stays in English. */
const WAITING_ON_OWNER = /^Waiting on owner:[ \t]*/;

const TASK_ORDER: TaskEventType[] = ['taskStarted', 'taskCompleted', 'taskWaitingOnOwner', 'taskCancelled', 'taskAbandoned'];

function states(plans: LoadedPlan[]): Map<string, { name: string; status: PlanStatus }> {
  const m = new Map<string, { name: string; status: PlanStatus }>();
  for (const p of plans) if ('status' in p) m.set(p.folder, { name: p.name, status: p.status });
  return m;
}

/** Moved to `status` in this load. */
const passed = (before: TaskStatus, after: TaskStatus, status: string) => after.status === status && before.status !== status;

/**
 * The events of a task. `fallen` says, for each give-up root, how many tasks fell with it in this load.
 * Resuming (`abandoned` → `ready`/`draft`) does not alert; a child of the give-up (`Given up with:`) gets no event of its own.
 */
function taskEvents(before: TaskStatus, after: TaskStatus, fallen: Map<string, number>): ({ type: TaskEventType } & Detail)[] {
  const r: ({ type: TaskEventType } & Detail)[] = [];
  if (passed(before, after, 'in-progress')) r.push({ type: 'taskStarted' });
  if (passed(before, after, 'done')) r.push({ type: 'taskCompleted' });
  if (passed(before, after, 'cancelled'))
    r.push({ type: 'taskCancelled', ...(after.replaced_by ? { replacement: after.replaced_by } : {}) });
  if (passed(before, after, 'abandoned') && after.given_up_by) r.push({ type: 'taskAbandoned', together: fallen.get(after.id) ?? 0 });
  const step = after.next_step ?? '';
  if (after.status === 'in-progress' && WAITING_ON_OWNER.test(step) && step !== (before.next_step ?? '')) {
    r.push({ type: 'taskWaitingOnOwner', action: step.replace(WAITING_ON_OWNER, '') });
  }
  return r;
}

function runEvents(base: Base, before: Run | null, after: Run | null): NotifyEvent[] {
  const r: NotifyEvent[] = [];
  const sameLog = before !== null && after !== null && before.log === after.log;
  if (sameLog) {
    if (!before.open && after.open) r.push({ ...base, type: 'runOpened', log: after.log });
    if (before.open && !after.open) r.push({ ...base, type: 'runClosed', log: after.log });
  } else {
    // Another run in its place (or none): the open one that vanished closed; the new one alerts if already open.
    if (before?.open) r.push({ ...base, type: 'runClosed', log: before.log });
    if (after?.open) r.push({ ...base, type: 'runOpened', log: after.log });
  }
  // The handoff: a stamp that differs from the previous load's in the same log, or a new run that already carries it.
  // A stamp that disappears (the `## Handoff` deleted) is not an alert.
  const stamp = after?.handoff ?? null;
  if (after && stamp !== null && (!sameLog || stamp !== (before?.handoff ?? null))) {
    r.push({ ...base, type: 'handoff', log: after.log, handoff: stamp });
  }
  return r;
}

/**
 * The events between the previous load and the new one. With no previous load (the first of the session), none.
 * Counts only what changed in a plan read in both (by folder) and in a task present in both; a plan with an
 * error in either is left out. More than `AGGREGATION_LIMIT` of the same type in a plan become one.
 */
export function eventsBetween(previous: LoadedPlan[] | undefined, currentPlans: LoadedPlan[]): NotifyEvent[] {
  if (!previous) return [];
  const before = states(previous);
  const events: NotifyEvent[] = [];
  for (const [folder, { name, status }] of states(currentPlans)) {
    const oldItem = before.get(folder);
    if (!oldItem) continue;
    const base: Base = { plan: name, folder };
    const oldOnes = new Map(oldItem.status.tasks.map((t) => [t.id, t]));
    const byType = new Map<TaskEventType, (EventTask & Detail)[]>(TASK_ORDER.map((type) => [type, []]));
    // The children that fell in this load, counted by root (`Given up with:`): the cascade is a single alert.
    const fallen = new Map<string, number>();
    for (const t of status.tasks) {
      const v = oldOnes.get(t.id);
      if (v && t.given_up_with && passed(v, t, 'abandoned')) fallen.set(t.given_up_with, (fallen.get(t.given_up_with) ?? 0) + 1);
    }
    for (const t of status.tasks) {
      const v = oldOnes.get(t.id);
      if (!v) continue;
      for (const { type, ...detail } of taskEvents(v, t, fallen)) byType.get(type)?.push({ id: t.id, title: t.title, ...detail });
    }
    for (const [type, list] of byType) {
      if (list.length <= AGGREGATION_LIMIT) events.push(...list.map((x): NotifyEvent => ({ ...base, type, ...x })));
      else events.push({ ...base, type, tasks: list.map(({ id, title }) => ({ id, title })) });
    }
    events.push(...runEvents(base, oldItem.status.run, status.run));
  }
  return events;
}

/** The output channel line for an event. */
export function eventLine(e: NotifyEvent, { t }: Strings): string {
  if (e.type === 'handoff') return t('log.eventHandoff', e.plan, e.log, e.handoff);
  if ('log' in e) return t(e.type === 'runOpened' ? 'log.eventRunOpened' : 'log.eventRunClosed', e.plan, e.log);
  if ('tasks' in e) {
    const key = {
      taskStarted: 'log.eventsStarted',
      taskCompleted: 'log.eventsFinished',
      taskWaitingOnOwner: 'log.eventsWaitingOnYou',
      taskCancelled: 'log.eventsCancelled',
      taskAbandoned: 'log.eventsGivenUp',
    } as const;
    return t(key[e.type], e.plan, e.tasks.length, e.tasks.map((x) => x.id).join(', '));
  }
  if (e.type === 'taskWaitingOnOwner') return t('log.eventWaitingOnYou', e.plan, e.id, e.title, e.action ?? '');
  if (e.type === 'taskCancelled') {
    if (e.replacement) return t('log.eventCancelledReplaced', e.plan, e.id, e.title, e.replacement);
    return t('log.eventCancelled', e.plan, e.id, e.title);
  }
  if (e.type === 'taskAbandoned') return t('log.eventGivenUp', e.plan, e.id, e.title, e.together ?? 0);
  return t(e.type === 'taskStarted' ? 'log.eventStarted' : 'log.eventFinished', e.plan, e.id, e.title);
}

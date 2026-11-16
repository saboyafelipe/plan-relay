// The whole shape of the views a `status` message carries. The webview receives them as JSON from the host, or from
// the state the page saved, and draws every field: a view of the wrong shape is refused, not drawn by halves.
import type { Badge } from './badge';
import type { IdeaInput, TaskGroup, TaskTier } from './input';
import { isRecord } from './util';
import { IDEA_ACTIONS, type IdeaView, type IdeasView, type PhaseView, type PlanView, type TaskView } from './view';

const GROUPS: readonly unknown[] = [
  'in-progress',
  'available',
  'owner',
  'blocked',
  'draft',
  'done',
  'cancelled',
  'abandoned',
  'invalid',
] satisfies readonly TaskGroup[];
const TIERS: readonly unknown[] = ['junior', 'mid', 'senior'] satisfies readonly TaskTier[];
const BADGES: readonly unknown[] = ['done', 'run-open', 'owner', 'in-progress', 'idle'] satisfies readonly Badge[];
const IDEA_STATES: readonly unknown[] = ['open', 'refining', 'ready', 'mapped', 'invalid'] satisfies readonly IdeaInput['status'][];

function isText(x: unknown): x is string {
  return typeof x === 'string';
}

function isNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function isTexts(x: unknown): x is string[] {
  return Array.isArray(x) && x.every(isText);
}

function isTextOrNull(x: unknown): x is string | null {
  return x === null || isText(x);
}

function isTask(x: unknown): x is TaskView {
  if (!isRecord(x)) return false;
  return (
    isText(x.id) &&
    isText(x.title) &&
    isText(x.file) &&
    GROUPS.includes(x.group) &&
    isText(x.type) &&
    isText(x.track) &&
    TIERS.includes(x.tier) &&
    isTexts(x.repos) &&
    isTexts(x.blockedBy) &&
    isTexts(x.waitingOn) &&
    isTexts(x.unblocks) &&
    isNumber(x.pendingUnblocks) &&
    isTextOrNull(x.started) &&
    isTextOrNull(x.finished) &&
    isTextOrNull(x.nextStep) &&
    isText(x.phase) &&
    isNumber(x.depth) &&
    (x.duration === null || isNumber(x.duration)) &&
    (x.replacement === undefined || isText(x.replacement)) &&
    (x.giveUpRoot === undefined || isText(x.giveUpRoot)) &&
    (x.ownerGiveUp === undefined || x.ownerGiveUp === true)
  );
}

function isCounts(x: unknown): boolean {
  return isRecord(x) && Object.entries(x).every(([group, n]) => GROUPS.includes(group) && isNumber(n));
}

function isPhase(x: unknown): x is PhaseView {
  if (!isRecord(x)) return false;
  return (
    isText(x.title) &&
    isNumber(x.done) &&
    isNumber(x.total) &&
    isNumber(x.pct) &&
    isText(x.dir) &&
    isNumber(x.inProgress) &&
    typeof x.abandoned === 'boolean' &&
    isCounts(x.counts) &&
    Array.isArray(x.tasks) &&
    x.tasks.every(isTask)
  );
}

export function isPlanView(x: unknown): x is PlanView {
  if (!isRecord(x)) return false;
  return (
    isText(x.id) &&
    isText(x.name) &&
    (x.badge === undefined || BADGES.includes(x.badge)) &&
    isNumber(x.pct) &&
    isNumber(x.done) &&
    isNumber(x.total) &&
    Array.isArray(x.phases) &&
    x.phases.every(isPhase) &&
    Array.isArray(x.tasks) &&
    x.tasks.every(isTask) &&
    isTexts(x.parallel) &&
    (x.log === undefined || isText(x.log)) &&
    (x.runOpen === undefined || typeof x.runOpen === 'boolean') &&
    (x.error === undefined || isText(x.error))
  );
}

function isIdea(x: unknown): x is IdeaView {
  if (!isRecord(x)) return false;
  return (
    isText(x.id) &&
    isText(x.title) &&
    IDEA_STATES.includes(x.status) &&
    (x.questions === null || isNumber(x.questions)) &&
    (x.plan === undefined || isText(x.plan))
  );
}

export function isIdeasView(x: unknown): x is IdeasView {
  if (!isRecord(x)) return false;
  const actions: readonly unknown[] = IDEA_ACTIONS;
  return Array.isArray(x.items) && x.items.every(isIdea) && Array.isArray(x.actions) && x.actions.every((a) => actions.includes(a));
}

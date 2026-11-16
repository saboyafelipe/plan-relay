import type { StatusInput, TaskGroup, TaskInput } from './input';
import { decideBadge } from './badge';

function task(group: TaskGroup): TaskInput {
  return {
    id: 'F0-01',
    title: 't',
    file: 'phase-0/f.md',
    group: group,
    type: 'code',
    track: 'panel',
    tier: 'senior',
    repos: [],
    blocked_by: [],
    unblocks: 0,
    started: null,
    finished: null,
    next_step: null,
    waiting_on: [],
  };
}

function status(
  groups: TaskGroup[],
  { done = 0, total = groups.length, isOpen }: { done?: number; total?: number; isOpen?: boolean } = {},
): StatusInput {
  return {
    progress: { done, total, pct: 0 },
    phases: [],
    tasks: groups.map(task),
    parallel: [],
    run: isOpen === undefined ? null : { open: isOpen, log: 'notes/run.md' },
  };
}

describe('decideBadge', () => {
  it('done when all the counted tasks are done', () => {
    expect(decideBadge(status(['done', 'done', 'cancelled'], { done: 2, total: 2 }))).toBe('done');
  });

  it('total 0 is not done', () => {
    expect(decideBadge(status([], { done: 0, total: 0 }))).toBe('idle');
  });

  it('run open when the log is open', () => {
    expect(decideBadge(status(['available'], { isOpen: true }))).toBe('run-open');
  });

  it('needs you when there are owner tasks', () => {
    expect(decideBadge(status(['available', 'owner'], { isOpen: false }))).toBe('owner');
  });

  it('in progress when there are in-progress tasks', () => {
    expect(decideBadge(status(['available', 'in-progress']))).toBe('in-progress');
  });

  it('right after «Executar»: an in-progress task, with no pilot log or owner tasks, gives in progress', () => {
    // The shape of the status.sh --json of the new plan at the moment the session claims its first task.
    expect(decideBadge(status(['in-progress', 'blocked', 'blocked']))).toBe('in-progress');
  });

  it('idle for the rest', () => {
    expect(decideBadge(status(['available', 'blocked', 'draft']))).toBe('idle');
  });

  it('precedence: an open pilot with owner and in-progress tasks gives run open', () => {
    expect(decideBadge(status(['owner', 'in-progress'], { isOpen: true }))).toBe('run-open');
  });

  it('precedence: owner before in progress', () => {
    expect(decideBadge(status(['in-progress', 'owner']))).toBe('owner');
  });
});

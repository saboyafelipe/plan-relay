import { describe, expect, it } from 'vitest';
import { createStrings } from '@plan-relay/i18n';
import xTest from '@plan-relay/i18n/x-test.json';
import { readHeader } from '@plan-relay/reader';
import type { Run, PlanStatus, TaskStatus } from '../plans/contract';
import type { LoadedPlan } from '../plans/load';
import { AGGREGATION_LIMIT, eventsBetween, eventLine, type NotifyEvent } from './events';

function task(id: string, status: string, next_step: string | null = null): TaskStatus {
  return {
    id,
    title: `Título de ${id}`,
    status,
    type: 'code',
    track: 'panel',
    tier: 'mid',
    repos: [],
    blocked_by: [],
    waiting_on: [],
    group: status === 'in-progress' ? 'in-progress' : 'available',
    unblocks: 0,
    started: null,
    finished: null,
    next_step,
    file: `phase-1/${id}.md`,
  };
}

function plan(name: string, tasks: TaskStatus[], run: Run | null = null): LoadedPlan {
  const status = { contract: 1, name: name, tasks, run } as unknown as PlanStatus;
  return { workspaceFolder: '/home/dev/projeto', name, folder: `/home/dev/projeto/agent_plans/${name}`, status };
}

function withError(name: string): LoadedPlan {
  return {
    workspaceFolder: '/home/dev/projeto',
    name,
    folder: `/home/dev/projeto/agent_plans/${name}`,
    error: { code: 'exception', args: ['falhou'] },
  };
}

const FOLDER = '/home/dev/projeto/agent_plans/demo';

describe('eventsBetween', () => {
  it('the first load yields no event', () => {
    expect(
      eventsBetween(undefined, [
        plan('demo', [task('F1-01', 'in-progress', 'Waiting on owner: x')], { log: 'notes/run-1.md', open: true }),
      ]),
    ).toEqual([]);
  });

  it('nothing changed, nothing happens', () => {
    const p = plan('demo', [task('F1-01', 'in-progress')], { log: 'notes/run-1.md', open: true });
    expect(eventsBetween([p], [p])).toEqual([]);
  });

  it('ready → in-progress yields "started"', () => {
    const events = eventsBetween([plan('demo', [task('F1-01', 'ready')])], [plan('demo', [task('F1-01', 'in-progress')])]);
    expect(events).toEqual<NotifyEvent[]>([{ type: 'taskStarted', plan: 'demo', folder: FOLDER, id: 'F1-01', title: 'Título de F1-01' }]);
  });

  it('in-progress → done yields "finished"', () => {
    const events = eventsBetween([plan('demo', [task('F1-01', 'in-progress')])], [plan('demo', [task('F1-01', 'done')])]);
    expect(events).toEqual<NotifyEvent[]>([{ type: 'taskCompleted', plan: 'demo', folder: FOLDER, id: 'F1-01', title: 'Título de F1-01' }]);
  });

  it('cancelled alerts (it replaces the earlier "cancelled does not alert" rule)', () => {
    expect(
      eventsBetween([plan('demo', [task('F1-01', 'in-progress')])], [plan('demo', [task('F1-01', 'cancelled')])]).map((e) => e.type),
    ).toEqual(['taskCancelled']);
  });

  it('any next_step → "Waiting on owner: …" yields "waiting on owner", with the action', () => {
    const events = eventsBetween(
      [plan('demo', [task('F1-01', 'in-progress', 'escrever os testes')])],
      [plan('demo', [task('F1-01', 'in-progress', 'Waiting on owner: rodar `npm login`')])],
    );
    expect(events).toEqual<NotifyEvent[]>([
      { type: 'taskWaitingOnOwner', plan: 'demo', folder: FOLDER, id: 'F1-01', title: 'Título de F1-01', action: 'rodar `npm login`' },
    ]);
  });

  it('the same "Waiting on owner" again yields nothing; a new text does', () => {
    const before = plan('demo', [task('F1-01', 'in-progress', 'Waiting on owner: escolher A ou B')]);
    expect(eventsBetween([before], [before])).toEqual([]);
    const after = plan('demo', [task('F1-01', 'in-progress', 'Waiting on owner: rodar o deploy')]);
    expect(eventsBetween([before], [after]).map((e) => e.type)).toEqual(['taskWaitingOnOwner']);
  });

  it('the last `Next step:` of the file counts: a "Waiting on owner" placed above it changes nothing', () => {
    // The owner's review case: the new line was placed right below the `## Log`, and the last `Next step:`
    // (from an earlier session) already started with "Waiting on owner:". No change in `next_step`, no event.
    const file = (log: string) => `Status: in-progress\nType: code\n\n# F1-01 - Título de F1-01\n\n## Log\n${log}`;
    const session1 = '### sessão 1\n- Next step: Waiting on owner: conferir no Dev Host\n';
    const next = (text: string) => readHeader(file(text)).next_step;
    const before = plan('demo', [task('F1-01', 'in-progress', next(session1))]);
    const above = plan('demo', [task('F1-01', 'in-progress', next(`Next step: Waiting on owner: abc\n${session1}`))]);
    expect(eventsBetween([before], [above])).toEqual([]);
    const finished = plan('demo', [task('F1-01', 'in-progress', next(`${session1}- Next step: Waiting on owner: abc\n`))]);
    expect(eventsBetween([before], [finished]).map((e) => (e.type === 'taskWaitingOnOwner' && 'action' in e ? e.action : e.type))).toEqual([
      'abc',
    ]);
  });

  it('"Waiting on owner" on a task that is not in-progress yields nothing', () => {
    expect(
      eventsBetween([plan('demo', [task('F1-01', 'ready', 'x')])], [plan('demo', [task('F1-01', 'ready', 'Waiting on owner: y')])]),
    ).toEqual([]);
  });

  it('the blocked group (pending dependency) is not waiting on the owner', () => {
    const blockedTask = { ...task('F1-02', 'ready'), group: 'blocked' } as TaskStatus;
    expect(eventsBetween([plan('demo', [task('F1-02', 'ready')])], [plan('demo', [blockedTask])])).toEqual([]);
  });

  it('a new task already done yields no event', () => {
    expect(eventsBetween([plan('demo', [])], [plan('demo', [task('F1-01', 'done'), task('F1-02', 'in-progress')])])).toEqual([]);
  });

  it('a new or vanished plan yields no task event', () => {
    const a = plan('a', [task('F1-01', 'ready')]);
    expect(eventsBetween([a], [a, plan('b', [task('F1-01', 'in-progress')])])).toEqual([]);
    expect(eventsBetween([a, plan('b', [task('F1-01', 'ready')])], [a])).toEqual([]);
  });

  it('the same name in another folder is another plan', () => {
    const other = { ...plan('demo', [task('F1-01', 'in-progress')]), folder: '/home/dev/outro/agent_plans/demo' };
    expect(eventsBetween([plan('demo', [task('F1-01', 'ready')])], [other])).toEqual([]);
  });

  it('run.open false → true yields "opened" and true → false yields "closed"', () => {
    const closed = plan('demo', [], { log: 'notes/run-2026-11-14.md', open: false });
    const opened = plan('demo', [], { log: 'notes/run-2026-11-14.md', open: true });
    expect(eventsBetween([closed], [opened])).toEqual<NotifyEvent[]>([
      { type: 'runOpened', plan: 'demo', folder: FOLDER, log: 'notes/run-2026-11-14.md' },
    ]);
    expect(eventsBetween([opened], [closed])).toEqual<NotifyEvent[]>([
      { type: 'runClosed', plan: 'demo', folder: FOLDER, log: 'notes/run-2026-11-14.md' },
    ]);
  });

  it('a new run (another run.log) already open yields "opened", also with no run before', () => {
    const oldOne = plan('demo', [], { log: 'notes/run-2026-11-13.md', open: false });
    const reopenedPlan = plan('demo', [], { log: 'notes/run-2026-11-14.md', open: true });
    expect(eventsBetween([oldOne], [reopenedPlan]).map((e) => e.type)).toEqual(['runOpened']);
    expect(eventsBetween([plan('demo', [])], [reopenedPlan]).map((e) => e.type)).toEqual(['runOpened']);
  });

  it('a new run already closed yields no event', () => {
    const oldOne = plan('demo', [], { log: 'notes/run-2026-11-13.md', open: false });
    expect(eventsBetween([oldOne], [plan('demo', [], { log: 'notes/run-2026-11-14.md', open: false })])).toEqual([]);
  });

  it('the open run that vanishes (another in its place, or none) yields "closed" for it', () => {
    const opened = plan('demo', [], { log: 'notes/run-2026-11-13.md', open: true });
    expect(eventsBetween([opened], [plan('demo', [], null)])).toEqual<NotifyEvent[]>([
      { type: 'runClosed', plan: 'demo', folder: FOLDER, log: 'notes/run-2026-11-13.md' },
    ]);
    expect(eventsBetween([opened], [plan('demo', [], { log: 'notes/run-2026-11-14.md', open: true })]).map((e) => e.type)).toEqual([
      'runClosed',
      'runOpened',
    ]);
  });

  it('a plan with an error in either load is ignored', () => {
    const ok = plan('demo', [task('F1-01', 'in-progress')], { log: 'notes/run-1.md', open: true });
    expect(eventsBetween([withError('demo')], [ok])).toEqual([]);
    expect(eventsBetween([ok], [withError('demo')])).toEqual([]);
  });

  it(`up to ${AGGREGATION_LIMIT} events of the same type in the same plan go out one by one`, () => {
    const ids = Array.from({ length: AGGREGATION_LIMIT }, (_, i) => `F1-0${i + 1}`);
    const events = eventsBetween(
      [
        plan(
          'demo',
          ids.map((id) => task(id, 'in-progress')),
        ),
      ],
      [
        plan(
          'demo',
          ids.map((id) => task(id, 'done')),
        ),
      ],
    );
    expect(events.map((e) => ('id' in e ? e.id : '?'))).toEqual(ids);
  });

  it('a burst above the limit becomes one aggregated event per type and plan', () => {
    const ids = Array.from({ length: AGGREGATION_LIMIT + 2 }, (_, i) => `F1-0${i + 1}`);
    const before = [
      plan(
        'demo',
        ids.map((id) => task(id, 'in-progress')),
      ),
      plan('outro', [task('F2-01', 'ready')]),
    ];
    const after = [
      plan(
        'demo',
        ids.map((id) => task(id, 'done')),
      ),
      plan('outro', [task('F2-01', 'in-progress')]),
    ];
    const events = eventsBetween(before, after);
    expect(events).toEqual<NotifyEvent[]>([
      { type: 'taskCompleted', plan: 'demo', folder: FOLDER, tasks: ids.map((id) => ({ id, title: `Título de ${id}` })) },
      { type: 'taskStarted', plan: 'outro', folder: '/home/dev/projeto/agent_plans/outro', id: 'F2-01', title: 'Título de F2-01' },
    ]);
  });
});

describe('handoff', () => {
  const currentRun = (handoff: string | null, log = 'notes/run-1.md'): Run => ({ log, open: true, handoff });
  const one = (run: Run | null) => [plan('demo', [task('F1-01', 'in-progress')], run)];
  const handoff = (h: string, log = 'notes/run-1.md'): NotifyEvent => ({ type: 'handoff', plan: 'demo', folder: FOLDER, log, handoff: h });

  it('handoff null → stamp yields the event', () => {
    expect(eventsBetween(one(currentRun(null)), one(currentRun('2026-11-14 18:47')))).toEqual([handoff('2026-11-14 18:47')]);
  });

  it('the same stamp again yields nothing; a new stamp does', () => {
    expect(eventsBetween(one(currentRun('2026-11-14 18:47')), one(currentRun('2026-11-14 18:47')))).toEqual([]);
    expect(eventsBetween(one(currentRun('2026-11-14 18:47')), one(currentRun('2026-11-14 19:30')))).toEqual([handoff('2026-11-14 19:30')]);
  });

  it('a stamp that disappears (handoff → null) yields no event', () => {
    expect(eventsBetween(one(currentRun('2026-11-14 18:47')), one(currentRun(null)))).toEqual([]);
  });

  it('the first load with the handoff already filled in yields nothing', () => {
    expect(eventsBetween(undefined, one(currentRun('2026-11-14 18:47')))).toEqual([]);
  });

  it('a new run already with a handoff yields the event (and its opening)', () => {
    const events = eventsBetween(one(null), one(currentRun('2026-11-14 18:47')));
    expect(events.map((e) => e.type)).toEqual(['runOpened', 'handoff']);
    expect(events[1]).toEqual(handoff('2026-11-14 18:47'));
  });

  it(`another autopilot log with a handoff yields the event, after the old one's closing and the new one's opening`, () => {
    expect(
      eventsBetween(one(currentRun('2026-11-14 18:47', 'notes/run-1.md')), one(currentRun('2026-11-14 18:47', 'notes/run-2.md'))).map(
        (e) => e.type,
      ),
    ).toEqual(['runClosed', 'runOpened', 'handoff']);
  });

  it('the handoff does not enter the task aggregation and the wait on owner follows its own', () => {
    const ids = Array.from({ length: AGGREGATION_LIMIT + 1 }, (_, i) => `F1-0${i + 1}`);
    const before = [
      plan(
        'demo',
        ids.map((id) => task(id, 'in-progress')),
        currentRun(null),
      ),
    ];
    const after = [
      plan(
        'demo',
        ids.map((id) => task(id, 'in-progress', 'Waiting on owner: a')),
        currentRun('2026-11-14 18:47'),
      ),
    ];
    const events = eventsBetween(before, after);
    expect(events.filter((e) => e.type === 'handoff')).toEqual([handoff('2026-11-14 18:47')]);
    expect(events.filter((e) => e.type === 'taskWaitingOnOwner')).toHaveLength(1);
    expect(events.find((e) => e.type === 'taskWaitingOnOwner')).toHaveProperty('tasks');
  });
});

describe('eventLine', () => {
  const t = createStrings('x-test', xTest);
  it('one line per type, with plan, ID, title and action', () => {
    const base = { plan: 'demo', folder: FOLDER };
    expect(eventLine({ ...base, type: 'taskStarted', id: 'F1-01', title: 'T' }, t)).toBe('x-test:log.eventStarted demo F1-01 T');
    expect(eventLine({ ...base, type: 'taskCompleted', id: 'F1-01', title: 'T' }, t)).toBe('x-test:log.eventFinished demo F1-01 T');
    expect(eventLine({ ...base, type: 'taskWaitingOnOwner', id: 'F1-01', title: 'T', action: 'a' }, t)).toBe(
      'x-test:log.eventWaitingOnYou demo F1-01 T a',
    );
    expect(eventLine({ ...base, type: 'runOpened', log: 'l' }, t)).toBe('x-test:log.eventRunOpened demo l');
    expect(eventLine({ ...base, type: 'runClosed', log: 'l' }, t)).toBe('x-test:log.eventRunClosed demo l');
    expect(eventLine({ ...base, type: 'handoff', log: 'l', handoff: '2026-11-14 18:47' }, t)).toBe(
      'x-test:log.eventHandoff demo l 2026-11-14 18:47',
    );
    const tasks = [
      { id: 'F1-01', title: 'A' },
      { id: 'F1-02', title: 'B' },
    ];
    expect(eventLine({ ...base, type: 'taskStarted', tasks }, t)).toBe('x-test:log.eventsStarted demo 2 F1-01, F1-02');
    expect(eventLine({ ...base, type: 'taskCompleted', tasks }, t)).toBe('x-test:log.eventsFinished demo 2 F1-01, F1-02');
    expect(eventLine({ ...base, type: 'taskWaitingOnOwner', tasks }, t)).toBe('x-test:log.eventsWaitingOnYou demo 2 F1-01, F1-02');
  });
});

describe('cancel and give up', () => {
  const withFilters = (t: TaskStatus, extra: Partial<TaskStatus>): TaskStatus => ({ ...t, ...extra });
  const abandoned = (id: string, extra: Partial<TaskStatus>) => withFilters(task(id, 'abandoned'), { group: 'abandoned', ...extra });

  it('ready → cancelled yields "cancelled", without a replacement', () => {
    expect(eventsBetween([plan('demo', [task('F1-01', 'ready')])], [plan('demo', [task('F1-01', 'cancelled')])])).toEqual<NotifyEvent[]>([
      { type: 'taskCancelled', plan: 'demo', folder: FOLDER, id: 'F1-01', title: 'Título de F1-01' },
    ]);
  });

  it('cancelled with `Replaced by:` carries the replacement', () => {
    const after = withFilters(task('F1-01', 'cancelled'), { replaced_by: 'F1-05' });
    expect(eventsBetween([plan('demo', [task('F1-01', 'in-progress')])], [plan('demo', [after])])).toEqual<NotifyEvent[]>([
      { type: 'taskCancelled', plan: 'demo', folder: FOLDER, id: 'F1-01', title: 'Título de F1-01', replacement: 'F1-05' },
    ]);
  });

  it('cancelled that stays cancelled does not alert again', () => {
    const c = plan('demo', [withFilters(task('F1-01', 'cancelled'), { replaced_by: 'F1-05' })]);
    expect(eventsBetween([c], [c])).toEqual([]);
  });

  it('a give-up of 6 tasks becomes a single event, "with 5 more"', () => {
    const ids = ['F1-01', 'F1-02', 'F1-03', 'F2-01', 'F2-02', 'F3-01'];
    const before = plan(
      'demo',
      ids.map((id) => task(id, id === 'F3-01' ? 'draft' : 'ready')),
    );
    const after = plan(
      'demo',
      ids.map((id, i) => (i === 0 ? abandoned(id, { given_up_by: 'owner' }) : abandoned(id, { given_up_with: 'F1-01' }))),
    );
    expect(eventsBetween([before], [after])).toEqual<NotifyEvent[]>([
      { type: 'taskAbandoned', plan: 'demo', folder: FOLDER, id: 'F1-01', title: 'Título de F1-01', together: 5 },
    ]);
  });

  it('giving up a task with no dependents yields "with 0 more"', () => {
    const events = eventsBetween([plan('demo', [task('F4-07', 'ready')])], [plan('demo', [abandoned('F4-07', { given_up_by: 'owner' })])]);
    expect(events).toEqual<NotifyEvent[]>([
      { type: 'taskAbandoned', plan: 'demo', folder: FOLDER, id: 'F4-07', title: 'Título de F4-07', together: 0 },
    ]);
  });

  it('only counts the children that fell in this load and with this root', () => {
    const before = plan('demo', [
      task('F1-01', 'ready'),
      task('F1-02', 'ready'),
      abandoned('F1-03', { given_up_with: 'F1-01' }),
      task('F1-04', 'ready'),
    ]);
    const after = plan('demo', [
      abandoned('F1-01', { given_up_by: 'owner' }),
      abandoned('F1-02', { given_up_with: 'F1-01' }),
      abandoned('F1-03', { given_up_with: 'F1-01' }),
      abandoned('F1-04', { given_up_with: 'F9-09' }),
    ]);
    expect(eventsBetween([before], [after])).toEqual<NotifyEvent[]>([
      { type: 'taskAbandoned', plan: 'demo', folder: FOLDER, id: 'F1-01', title: 'Título de F1-01', together: 1 },
    ]);
  });

  it(`${AGGREGATION_LIMIT + 1} separate give-ups in the same plan become one aggregated alert, counting roots`, () => {
    const roots = ['F1-01', 'F2-01', 'F3-01', 'F4-01'];
    const children = roots.map((r) => r.replace('-01', '-02'));
    const before = plan(
      'demo',
      [...roots, ...children].map((id) => task(id, 'ready')),
    );
    const after = plan('demo', [
      ...roots.map((id) => abandoned(id, { given_up_by: 'owner' })),
      ...children.map((id, i) => abandoned(id, { given_up_with: roots[i]! })),
    ]);
    expect(eventsBetween([before], [after])).toEqual<NotifyEvent[]>([
      { type: 'taskAbandoned', plan: 'demo', folder: FOLDER, tasks: roots.map((id) => ({ id, title: `Título de ${id}` })) },
    ]);
  });

  it('resuming does not alert: abandoned → ready or draft', () => {
    const before = plan('demo', [abandoned('F1-01', { given_up_by: 'owner' }), abandoned('F1-02', { given_up_with: 'F1-01' })]);
    const after = plan('demo', [task('F1-01', 'ready'), task('F1-02', 'draft')]);
    expect(eventsBetween([before], [after])).toEqual([]);
  });

  it('the first load with cancelled and abandoned tasks does not alert', () => {
    const p = plan('demo', [
      withFilters(task('F1-01', 'cancelled'), { replaced_by: 'F1-02' }),
      abandoned('F1-03', { given_up_by: 'owner' }),
    ]);
    expect(eventsBetween(undefined, [p])).toEqual([]);
  });

  it('eventLine for the new types', () => {
    const t = createStrings('x-test', xTest);
    const base = { plan: 'demo', folder: FOLDER };
    expect(eventLine({ ...base, type: 'taskCancelled', id: 'F1-01', title: 'T' }, t)).toBe('x-test:log.eventCancelled demo F1-01 T');
    expect(eventLine({ ...base, type: 'taskCancelled', id: 'F1-01', title: 'T', replacement: 'F1-05' }, t)).toBe(
      'x-test:log.eventCancelledReplaced demo F1-01 T F1-05',
    );
    expect(eventLine({ ...base, type: 'taskAbandoned', id: 'F1-01', title: 'T', together: 5 }, t)).toBe(
      'x-test:log.eventGivenUp demo F1-01 T 5',
    );
    const tasks = [
      { id: 'F1-01', title: 'A' },
      { id: 'F1-02', title: 'B' },
    ];
    expect(eventLine({ ...base, type: 'taskCancelled', tasks }, t)).toBe('x-test:log.eventsCancelled demo 2 F1-01, F1-02');
    expect(eventLine({ ...base, type: 'taskAbandoned', tasks }, t)).toBe('x-test:log.eventsGivenUp demo 2 F1-01, F1-02');
  });
});

import type { ErrorInput, StatusInput, TaskGroup, PlanInput, TaskInput } from './input';
import type { PlanStatus } from '@plan-relay/reader';
import { depthOf, nowView, planView } from './view';
import { stringsFor } from '@plan-relay/i18n';
import { LARGE_PLAN_PHASES, largePlan } from './testing/large-plan';

// The plan status of the template fixture (core/template/tests/fixture), in the shape of `--json`,
// with only the keys the view reads. The reader → view path with the real status.sh is tested in the host.
const NOW = new Date(Date.UTC(2026, 10, 13, 12, 5));

function task(id: string, group: TaskGroup, extra: Partial<TaskInput> = {}): TaskInput {
  const phase = id.startsWith('F0-') ? 'phase-0-base' : 'phase-1-resto';
  return {
    id,
    title: `Task ${id}`,
    file: `${phase}/${id}.md`,
    group,
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
    ...extra,
  };
}

const STATUS: StatusInput = {
  progress: { done: 1, total: 9, pct: 11 },
  phases: [
    { dir: 'phase-0-base', title: 'Fase 0 — Base', done: 1, total: 2, in_progress: 1 },
    { dir: 'phase-1-resto', title: 'Fase 1 — Resto', done: 0, total: 7, in_progress: 0 },
  ],
  tasks: [
    task('F0-01', 'done', { started: '2026-11-12T09:00Z', finished: '2026-11-12T10:30Z', type: 'research', track: 'ci', tier: 'mid' }),
    task('F0-02', 'in-progress', {
      title: 'Uma task em andamento',
      file: 'phase-0-base/F0-02-andamento.md',
      started: '2026-11-13T10:00Z',
      next_step: 'retomar o \\"passo 3\\"\tdepois do teste',
      blocked_by: ['F0-01'],
      repos: ['app'],
    }),
    task('F1-01', 'available', { title: 'Título com "aspas" e barra \\ invertida', blocked_by: ['F0-01'], unblocks: 1 }),
    task('F1-02', 'available', { unblocks: 1 }),
    task('F1-03', 'owner', { tier: 'junior' }),
    task('F1-03.1', 'available'),
    task('F1-04', 'blocked', { blocked_by: ['F1-01', 'F1-02', 'F9-99'], waiting_on: ['F1-01', 'F9-99(?)'] }),
    task('F1-05', 'draft'),
    task('F1-06', 'cancelled', { blocked_by: ['F1-02'] }),
    task('F1-03.1.4', 'draft'),
  ],
  parallel: ['F1-01', 'F1-02'],
  run: { open: true, log: 'notes/run-2026-11-13.md' },
};

const PLAN: PlanInput = { folder: '/ws/agent_plans/test-plan', name: 'test-plan', status: STATUS };

function ids(v: ReturnType<typeof planView>, key: string): string[] {
  return v.tasks.filter((t) => t.group === key).map((t) => t.id);
}

describe('planView', () => {
  it('card header: name, badge, percentage and bars per phase', () => {
    const v = planView(PLAN, NOW);
    expect(v).toMatchObject({ id: PLAN.folder, name: 'test-plan', badge: 'run-open', pct: 11, done: 1, total: 9 });
    expect(v.phases.map(({ title, done, total, pct }) => ({ title, done, total, pct }))).toEqual([
      { title: 'Fase 0 — Base', done: 1, total: 2, pct: 50 },
      { title: 'Fase 1 — Resto', done: 0, total: 7, pct: 0 },
    ]);
  });

  it('the tasks of each group come out in plan order', () => {
    const v = planView(PLAN, NOW);
    expect(ids(v, 'in-progress')).toEqual(['F0-02']);
    expect(ids(v, 'available')).toEqual(['F1-01', 'F1-02', 'F1-03.1']);
    expect(ids(v, 'owner')).toEqual(['F1-03']);
    expect(ids(v, 'blocked')).toEqual(['F1-04']);
  });

  it('the in-progress task has the duration and the next step; the waiting one has what it waits on', () => {
    const v = planView(PLAN, NOW);
    const running = v.tasks.find((t) => t.id === 'F0-02');
    expect(running).toMatchObject({
      title: 'Uma task em andamento',
      file: 'phase-0-base/F0-02-andamento.md',
      duration: 125,
      nextStep: 'retomar o \\"passo 3\\"\tdepois do teste',
    });
    expect(v.tasks.find((t) => t.id === 'F1-04')).toMatchObject({ waitingOn: ['F1-01', 'F9-99(?)'] });
    expect(v.tasks.find((t) => t.id === 'F1-01')?.title).toBe('Título com "aspas" e barra \\ invertida');
  });

  it('the bars per phase keep the order of phases, without reordering', () => {
    const phase = (title: string) => ({ dir: title, title, done: 0, total: 1, in_progress: 0 });
    const phases = [phase('phase-2-b'), phase('phase-10-c'), phase('phase-1-a')];
    const v = planView({ ...PLAN, status: { ...STATUS, phases } }, NOW);
    expect(v.phases.map((f) => f.title)).toEqual(['phase-2-b', 'phase-10-c', 'phase-1-a']);
  });

  it('accepts the status with extra contract keys, without copying them into the view', () => {
    const full = { ...STATUS, contract: 1, name: 'test-plan', language: 'pt-BR', profile: 'default', scripts_version: 2 };
    const v = planView({ ...PLAN, status: full }, NOW);
    expect(Object.keys(v).sort()).toEqual(['badge', 'done', 'id', 'log', 'name', 'parallel', 'pct', 'phases', 'runOpen', 'tasks', 'total']);
  });

  it('a plan with an error has no tasks or phases', () => {
    const error: ErrorInput = { code: 'invalid', args: ['plan.json'], cause: { code: 'notObject', args: ['plan.json'] } };
    const v = planView({ name: 'x', folder: '/ws/agent_plans/x', error }, NOW, stringsFor('pt-BR'));
    expect(v).toMatchObject({
      id: '/ws/agent_plans/x',
      name: 'x',
      error: 'plan.json inválido: plan.json não é um objeto',
      phases: [],
      tasks: [],
      parallel: [],
    });
    expect(v.badge).toBeUndefined();
  });

  describe('all tasks', () => {
    it('brings the tasks of every group, in plan order', () => {
      const v = planView(PLAN, NOW);
      expect(v.tasks.map((t) => [t.id, t.group])).toEqual(STATUS.tasks.map((t) => [t.id, t.group]));
    });

    it('each task carries the reader fields, with the phase and the depth', () => {
      const v = planView(PLAN, NOW);
      expect(v.tasks.find((t) => t.id === 'F0-02')).toEqual({
        id: 'F0-02',
        title: 'Uma task em andamento',
        file: 'phase-0-base/F0-02-andamento.md',
        group: 'in-progress',
        type: 'code',
        track: 'panel',
        tier: 'senior',
        repos: ['app'],
        blockedBy: ['F0-01'],
        waitingOn: [],
        unblocks: [],
        pendingUnblocks: 0,
        started: '2026-11-13T10:00Z',
        finished: null,
        nextStep: 'retomar o \\"passo 3\\"\tdepois do teste',
        phase: 'phase-0-base',
        depth: 0,
        duration: 125,
      });
      expect(v.tasks.find((t) => t.id === 'F0-01')).toMatchObject({
        type: 'research',
        track: 'ci',
        tier: 'mid',
        finished: '2026-11-12T10:30Z',
        duration: 90,
      });
      expect(v.tasks.find((t) => t.id === 'F1-04')).toMatchObject({
        blockedBy: ['F1-01', 'F1-02', 'F9-99'],
        waitingOn: ['F1-01', 'F9-99(?)'],
      });
    });

    it('unblocks is the inverse of blocked_by, including the done and cancelled ones', () => {
      const v = planView(PLAN, NOW);
      const unblocks = (id: string) => v.tasks.find((t) => t.id === id)?.unblocks;
      expect(unblocks('F0-01')).toEqual(['F0-02', 'F1-01']);
      expect(unblocks('F1-01')).toEqual(['F1-04']);
      expect(unblocks('F1-02')).toEqual(['F1-04', 'F1-06']);
      expect(unblocks('F1-04')).toEqual([]);
      expect(v.tasks.find((t) => t.id === 'F1-02')?.pendingUnblocks).toBe(1);
    });

    it('depth: 0 on a task, 1 on a subtask, 2 on a subtask of a subtask', () => {
      expect(depthOf('F1-10')).toBe(0);
      expect(depthOf('F1-10.1')).toBe(1);
      expect(depthOf('F1-10.1.4')).toBe(2);
      const v = planView(PLAN, NOW);
      expect(v.tasks.find((t) => t.id === 'F1-03.1.4')?.depth).toBe(2);
    });

    it('without a valid start there is no duration; the pending one does not count time', () => {
      const v = planView(PLAN, NOW);
      expect(v.tasks.find((t) => t.id === 'F1-01')?.duration).toBeNull();
    });

    it('each phase has its tasks and the count per group', () => {
      const v = planView(PLAN, NOW);
      const [f0, f1] = v.phases;
      expect(f0).toMatchObject({ dir: 'phase-0-base', inProgress: 1, counts: { done: 1, 'in-progress': 1 } });
      expect(f0?.tasks.map((t) => t.id)).toEqual(['F0-01', 'F0-02']);
      expect(f1?.counts).toEqual({ available: 3, owner: 1, blocked: 1, draft: 2, cancelled: 1 });
      expect(f1?.tasks).toHaveLength(8);
    });

    it('cancel and give up: replacement, give-up root and the abandoned phase', () => {
      const status: StatusInput = {
        ...STATUS,
        phases: [
          { dir: 'phase-0-base', title: 'Fase 0', done: 1, total: 1, in_progress: 0 },
          { dir: 'phase-1-resto', title: 'Fase 1', done: 0, total: 0, in_progress: 0, abandoned: true },
        ],
        tasks: [
          task('F0-01', 'done'),
          task('F0-02', 'cancelled', { replaced_by: 'F0-01' }),
          task('F0-03', 'abandoned', { given_up_by: 'owner' }),
          task('F1-01', 'abandoned', { given_up_with: 'F0-03', blocked_by: ['F0-03'] }),
        ],
      };
      const v = planView({ ...PLAN, status }, NOW);
      const byId = (id: string) => v.tasks.find((t) => t.id === id);
      expect(byId('F0-02')).toMatchObject({ replacement: 'F0-01' });
      expect(byId('F0-03')).toMatchObject({ ownerGiveUp: true });
      expect(byId('F0-03')?.giveUpRoot).toBeUndefined();
      expect(byId('F1-01')).toMatchObject({ giveUpRoot: 'F0-03' });
      // Without the key in the header, no field in the view.
      expect(byId('F0-01')).not.toHaveProperty('replacement');
      expect(byId('F0-01')).not.toHaveProperty('giveUpRoot');
      expect(byId('F0-01')).not.toHaveProperty('ownerGiveUp');
      expect(v.phases.map((f) => f.abandoned)).toEqual([false, true]);
      expect(v.phases[1]?.counts).toEqual({ abandoned: 1 });
    });

    it('the abandoned tasks ask for no action: they stay out of Now', () => {
      const status: StatusInput = { ...STATUS, tasks: [task('F0-03', 'abandoned', { given_up_by: 'owner' })], parallel: [] };
      expect(nowView([planView({ ...PLAN, status }, NOW)])).toEqual({ plans: [], empty: 'done' });
    });

    it('parallel and the log of the open run', () => {
      const v = planView(PLAN, NOW);
      expect(v.parallel).toEqual(['F1-01', 'F1-02']);
      expect(v.log).toBe('notes/run-2026-11-13.md');
      expect(v.runOpen).toBe(STATUS.run?.open);
      expect(planView({ ...PLAN, status: { ...STATUS, run: null } }, NOW).log).toBeUndefined();
      expect(planView({ ...PLAN, status: { ...STATUS, run: null } }, NOW).runOpen).toBeUndefined();
    });

    it('the reader validated status is accepted as it is', () => {
      const ofReader: PlanStatus = {
        ...STATUS,
        contract: 1,
        name: 'test-plan',
        language: 'pt-BR',
        profile: 'default',
        scripts_version: 7,
        progress: { ...STATUS.progress, in_progress: 1, draft: 2 },
        tasks: STATUS.tasks.map((t) => ({ ...t, status: t.group === 'available' ? 'ready' : t.group })),
      };
      expect(planView({ ...PLAN, status: ofReader }, NOW).tasks).toHaveLength(STATUS.tasks.length);
    });

    it('the large plan: 540 tasks, all in the view, in under 50 ms', () => {
      const status = largePlan();
      expect(status.tasks.length).toBeGreaterThanOrEqual(500);
      expect(status.phases).toHaveLength(LARGE_PLAN_PHASES);
      expect(status.tasks.some((t) => depthOf(t.id) === 2)).toBe(true);
      const large: PlanInput = { folder: '/ws/agent_plans/grande', name: 'grande', status };
      const v = planView(large, NOW);
      expect(v.tasks).toHaveLength(status.tasks.length);
      expect(v.phases.reduce((n, f) => n + f.tasks.length, 0)).toBe(status.tasks.length);
      // Each task lands in exactly one phase, so the work is one pass over the tasks, not a wall-clock budget.
      expect(new Set(v.phases.flatMap((f) => f.tasks.map((t) => t.id))).size).toBe(status.tasks.length);
      expect(planView(large, NOW)).toEqual(v);
    });
  });
});

describe('nowView', () => {
  const planB: PlanInput = {
    folder: '/ws/agent_plans/outro',
    name: 'outro',
    status: {
      ...STATUS,
      tasks: [
        task('G0-01', 'available', { unblocks: 5 }),
        task('G0-02', 'owner', { unblocks: 9 }),
        task('G0-03', 'in-progress', { started: '2026-11-13T11:00Z' }),
      ],
      parallel: ['G0-01'],
    },
  };
  const two = [planView(PLAN, NOW), planView(planB, NOW)];
  const ofPlan = (a: ReturnType<typeof nowView>, folder: string) => a.plans.find((p) => p.plan.id === folder);

  it('one block per plan, each with its groups in the order of the plan skill', () => {
    const a = nowView(two);
    expect(a.plans.map((p) => p.plan.id)).toEqual([PLAN.folder, planB.folder]);
    const b = ofPlan(a, planB.folder);
    expect(b?.running.map((i) => i.task.id)).toEqual(['G0-03']);
    expect(b?.owner.map((i) => i.task.id)).toEqual(['G0-02']);
    const p = ofPlan(a, PLAN.folder);
    expect(p?.available.map((i) => i.task.id)).toEqual(['F1-01', 'F1-02', 'F1-03.1']);
    expect(p?.owner.map((i) => i.task.id)).toEqual(['F1-03']);
  });

  it('the plan with an owner task comes first, then the one with an available one, then the rest; a tie keeps plan order', () => {
    const onlyInProgress: PlanInput = {
      folder: '/ws/agent_plans/andando',
      name: 'andando',
      status: { ...STATUS, tasks: [task('A-01', 'in-progress')], parallel: [] },
    };
    const onlyFree: PlanInput = {
      folder: '/ws/agent_plans/livre',
      name: 'livre',
      status: { ...STATUS, tasks: [task('L-01', 'available')], parallel: [] },
    };
    const withOwner: PlanInput = {
      folder: '/ws/agent_plans/dono',
      name: 'owner',
      status: { ...STATUS, tasks: [task('D-01', 'owner')], parallel: [] },
    };
    const a = nowView([onlyInProgress, onlyFree, withOwner].map((p) => planView(p, NOW)));
    expect(a.plans.map((p) => p.plan.name)).toEqual(['owner', 'livre', 'andando']);
  });

  it('uncut: all the available and the blocked ones, the latter by the ones waiting on the fewest', () => {
    const many: PlanInput = {
      folder: '/ws/agent_plans/muitas',
      name: 'muitas',
      status: {
        ...STATUS,
        tasks: [
          ...Array.from({ length: 10 }, (_, i) => task(`H-0${i}`, 'available')),
          task('H-15', 'blocked', { waiting_on: ['a', 'b', 'c'] }),
          task('H-16', 'blocked', { waiting_on: ['a'] }),
          task('H-17', 'blocked', { waiting_on: ['a', 'b'] }),
          task('H-18', 'blocked', { waiting_on: ['a', 'b', 'c', 'd'] }),
        ],
      },
    };
    const [m] = nowView([planView(many, NOW)]).plans;
    expect(m?.available).toHaveLength(10);
    expect(m?.next.map((i) => i.task.id)).toEqual(['H-16', 'H-17', 'H-15', 'H-18']);
  });

  it('marks the parallel ones', () => {
    const b = ofPlan(nowView(two), planB.folder);
    expect(b?.available.find((i) => i.task.id === 'G0-01')?.parallel).toBe(true);
    expect(b?.owner.find((i) => i.task.id === 'G0-02')?.parallel).toBe(false);
  });

  it('a plan with nothing to show stays out', () => {
    const finished: PlanInput = { ...PLAN, folder: '/ws/agent_plans/fim', status: { ...STATUS, tasks: [task('A-01', 'done')] } };
    const a = nowView([planView(finished, NOW), planView(planB, NOW)]);
    expect(a.plans.map((p) => p.plan.id)).toEqual([planB.folder]);
  });

  it('with nothing to do, says what unblocks next or that everything is done', () => {
    const idle: PlanInput = { ...PLAN, status: { ...STATUS, tasks: [task('A-01', 'blocked', { waiting_on: ['A-00'] })] } };
    expect(nowView([planView(idle, NOW)]).empty).toBe('waiting');
    const finished: PlanInput = { ...PLAN, status: { ...STATUS, tasks: [task('A-01', 'done')] } };
    expect(nowView([planView(finished, NOW)]).empty).toBe('done');
    expect(nowView([planView(finished, NOW)]).plans).toEqual([]);
    expect(nowView(two).empty).toBeNull();
  });

  it('ignores the plan with an error', () => {
    const error = planView(
      {
        name: 'x',
        folder: '/ws/agent_plans/x',
        error: { code: 'invalid', args: ['plan.json'], cause: { code: 'notObject', args: ['plan.json'] } },
      },
      NOW,
    );
    // With no plan read, nothing can be said to be done.
    expect(nowView([error]).empty).toBeNull();
    expect(nowView([error]).plans).toEqual([]);
  });
});

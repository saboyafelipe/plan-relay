import { isWebviewMessage, isHostMessage } from './messages';
import { ideasView, planView, type PlanView } from './view';
import { largePlan } from './testing/large-plan';

const NOW = new Date(Date.UTC(2026, 10, 13, 12, 5));

/** A real plan view, through JSON as the webview receives it. */
function plan(): PlanView {
  const view = planView(
    { folder: '/ws/agent_plans/a', name: 'a', status: { ...largePlan(), run: { open: true, log: 'notes/run.md' } } },
    NOW,
  );
  return JSON.parse(JSON.stringify(view)) as PlanView;
}

function status(plans: unknown[], ideas?: unknown): unknown {
  return { type: 'status', plans, updated: '10:42', ...(ideas === undefined ? {} : { ideas }) };
}

describe('isHostMessage, the status shape', () => {
  it('accepts the plan views and idea views the panel builds', () => {
    const failed = planView({ folder: '/ws/agent_plans/b', name: 'b', error: { code: 'notJson', args: ['plan.json', 'x'] } }, NOW);
    const ideas = ideasView(
      [
        { file: '/ws/agent_plans/_ideas/x.md', slug: 'x', title: 'X', status: 'open', openQuestions: 2, plan: null },
        { file: '/ws/agent_plans/_ideas/y.md', slug: 'y', title: 'Y', status: 'mapped', openQuestions: null, plan: 'y' },
      ],
      ['refine', 'map', 'open'],
    );
    expect(isHostMessage(status([plan(), JSON.parse(JSON.stringify(failed))], JSON.parse(JSON.stringify(ideas))))).toBe(true);
  });

  it('refuses a plan, a phase, a task or an idea of the wrong shape', () => {
    const cases: [string, (p: PlanView) => unknown][] = [
      ['plan is not an object', () => 'a'],
      ['plan without id', (p) => ({ ...p, id: undefined })],
      ['name not text', (p) => ({ ...p, name: 1 })],
      ['pct not a number', (p) => ({ ...p, pct: '50' })],
      ['unknown badge', (p) => ({ ...p, badge: 'other' })],
      ['phases not a list', (p) => ({ ...p, phases: {} })],
      ['parallel with a number', (p) => ({ ...p, parallel: [1] })],
      ['runOpen not boolean', (p) => ({ ...p, runOpen: 'yes' })],
      ['error not text', (p) => ({ ...p, error: {} })],
      ['phase without tasks', (p) => ({ ...p, phases: [{ ...p.phases[0], tasks: undefined }] })],
      ['phase counts not numbers', (p) => ({ ...p, phases: [{ ...p.phases[0], counts: { done: 'x' } }] })],
      ['task of unknown group', (p) => ({ ...p, tasks: [{ ...p.tasks[0], group: 'other' }] })],
      ['task of unknown tier', (p) => ({ ...p, tasks: [{ ...p.tasks[0], tier: 'lead' }] })],
      ['task blockedBy not a list', (p) => ({ ...p, tasks: [{ ...p.tasks[0], blockedBy: 'F0-01' }] })],
      ['task nextStep a number', (p) => ({ ...p, tasks: [{ ...p.tasks[0], nextStep: 3 }] })],
      ['task duration text', (p) => ({ ...p, tasks: [{ ...p.tasks[0], duration: '3' }] })],
      ['task ownerGiveUp false', (p) => ({ ...p, tasks: [{ ...p.tasks[0], ownerGiveUp: false }] })],
      ['task inside a phase', (p) => ({ ...p, phases: [{ ...p.phases[0], tasks: [{ ...p.tasks[0], id: null }] }] })],
    ];
    for (const [name, change] of cases) expect(isHostMessage(status([change(plan())])), name).toBe(false);
    const idea = { id: '/ws/agent_plans/_ideas/x.md', title: 'X', status: 'open', questions: null };
    for (const [name, item] of [
      ['idea without title', { ...idea, title: undefined }],
      ['idea of unknown status', { ...idea, status: 'other' }],
      ['idea questions text', { ...idea, questions: '2' }],
      ['idea plan a number', { ...idea, plan: 1 }],
    ] as const) {
      expect(isHostMessage(status([], { items: [item], actions: [] })), name).toBe(false);
    }
  });
});

describe('isWebviewMessage', () => {
  it('accepts the known shapes', () => {
    expect(isWebviewMessage({ type: 'ready' })).toBe(true);
    expect(isWebviewMessage({ type: 'refresh' })).toBe(true);
    expect(isWebviewMessage({ type: 'open', plan: '/ws/agent_plans/a', file: 'MAP.md' })).toBe(true);
    expect(isWebviewMessage({ type: 'install' })).toBe(true);
    expect(isWebviewMessage({ type: 'delete', plan: '/ws/agent_plans/a' })).toBe(true);
    expect(isWebviewMessage({ type: 'execute', plan: '/ws/agent_plans/a', id: 'F1-03' })).toBe(true);
    expect(isWebviewMessage({ type: 'run', plan: '/ws/agent_plans/a' })).toBe(true);
    expect(isWebviewMessage({ type: 'giveUp', plan: '/ws/agent_plans/a', id: 'F1-03' })).toBe(true);
    expect(isWebviewMessage({ type: 'reopen', plan: '/ws/agent_plans/a', id: 'F1-03' })).toBe(true);
    expect(isWebviewMessage({ type: 'copy', plan: '/ws/agent_plans/a' })).toBe(true);
    expect(isWebviewMessage({ type: 'copy', plan: '/ws/agent_plans/a', id: 'F1-03' })).toBe(true);
    for (const tab of ['now', 'plans', 'ideas']) expect(isWebviewMessage({ type: 'tab', tab })).toBe(true);
  });

  it('refuses the rest', () => {
    for (const x of [
      null,
      undefined,
      'ready',
      42,
      [],
      {},
      { type: 'status', plans: [] },
      { type: 'delete' },
      { type: 'delete', plan: '' },
      { type: 'delete', plan: 1 },
      { type: 'open' },
      { type: 'open', plan: 'a' },
      { type: 'open', file: 'MAP.md' },
      { type: 'open', plan: 1, file: 'MAP.md' },
      { type: 'open', plan: 'a', file: '' },
      { type: 'open', plan: '', file: 'MAP.md' },
      { type: 'uninstall' },
      { type: 'execute' },
      { type: 'execute', plan: '/ws/agent_plans/a' },
      { type: 'execute', id: 'F1-03' },
      { type: 'execute', plan: '/ws/agent_plans/a', id: '' },
      { type: 'execute', plan: '', id: 'F1-03' },
      { type: 'execute', plan: '/ws/agent_plans/a', id: 7 },
      { type: 'giveUp', plan: '/ws/agent_plans/a' },
      { type: 'giveUp', plan: '', id: 'F1-03' },
      { type: 'reopen', id: 'F1-03' },
      { type: 'reopen', plan: '/ws/agent_plans/a', id: 7 },
      { type: 'run' },
      { type: 'run', plan: '' },
      { type: 'run', plan: ['a'] },
      { type: 'copy' },
      { type: 'copy', plan: '' },
      { type: 'copy', plan: '/ws/agent_plans/a', id: '' },
      { type: 'copy', plan: '/ws/agent_plans/a', id: 7 },
      { type: 'resume', plan: '/ws/agent_plans/a', id: 'F1-03' },
      { type: 'tab' },
      { type: 'tab', tab: 'outra' },
      { type: 'tab', tab: 1 },
    ]) {
      expect(isWebviewMessage(x), JSON.stringify(x)).toBe(false);
    }
  });
});

describe('isHostMessage', () => {
  it('accepts the status and the load notice', () => {
    expect(isHostMessage({ type: 'status', plans: [], updated: '10:42' })).toBe(true);
    expect(isHostMessage({ type: 'loading', active: true })).toBe(true);
    expect(isHostMessage({ type: 'loading', active: false })).toBe(true);
    expect(isHostMessage({ type: 'plugin', plugin: { state: 'not-installed' } })).toBe(true);
    expect(isHostMessage({ type: 'plugin', plugin: { state: 'active-project', scope: 'project' } })).toBe(true);
    expect(isHostMessage({ type: 'notices', notices: [] })).toBe(true);
    expect(isHostMessage({ type: 'notices', notices: ['a extensão instalada (0.0.1)…'] })).toBe(true);
  });

  it('refuses the rest', () => {
    for (const x of [
      null,
      'status',
      { type: 'status' },
      { type: 'status', plans: {}, updated: '10:42' },
      { type: 'status', plans: [], updated: 1 },
      { type: 'loading' },
      { type: 'loading', active: 'sim' },
      { type: 'ready' },
      { type: 'plugin' },
      { type: 'plugin', plugin: 'ativo' },
      { type: 'plugin', plugin: { state: 'outro' } },
      { type: 'plugin', plugin: { status: 'not-installed' } },
      { type: 'notices' },
      { type: 'notices', notices: 'text' },
      { type: 'notices', notices: [1] },
    ]) {
      expect(isHostMessage(x), JSON.stringify(x)).toBe(false);
    }
  });
});

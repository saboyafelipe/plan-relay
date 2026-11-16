// The whole panel in the test language: no pt-BR text is left in the output.
import ptBR from '@plan-relay/i18n/pt-BR.json';
import xTest from '@plan-relay/i18n/x-test.json';
import { createStrings, stringsFor, type Strings } from '@plan-relay/i18n';
import { panelDocument } from './document';
import type { PlanInput } from './input';
import type { EnvironmentInput, PluginView } from './messages';
import { ideasView, planView, type TaskView, type PlanView } from './view';
import { pageKey, taskDetail, render } from './render';

const XTEXT = createStrings('x-test', xTest);
const X = XTEXT;
const PANEL_AREAS = ['documento', 'panel', 'badge', 'plugin', 'scope', 'duration', 'rodape', 'ideas', 'detail', 'abas'];
const NOW = new Date('2026-11-14T12:00:00Z');

/** Plan data in ASCII with no pt-BR word, to tell interface text from data. */
const DATA = [
  'jq',
  'git',
  'Zeta',
  'Qwx',
  'Rr',
  'Vv',
  'Ss',
  'Uu',
  'Phase Q',
  'Kx',
  'Step Q',
  'oops',
  'agent_plans/',
  'agent_plans/_ideas/',
  'Idq',
  // The ideas card: the folder path and the slug of each idea.
  'agent_plans/_ideas/',
  ...['i1', 'i2', 'i3', 'i4', 'i5', 'i6'],
  'senior',
  'panel',
  ...['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T99'],
  // The replacement of the cancelled task: the arrow and the ID, with no text from the language.
  '→ T1',
  // The task detail: type, file and dates of the test plan.
  'phase-q/T1.md',
  '2026-11-14 11:30 UTC',
];

type Group = 'in-progress' | 'available' | 'owner' | 'blocked';

function makeTask(id: string, group: Group, started: string | null = null) {
  return {
    id,
    title: 'Kx',
    file: `phase-q/${id}.md`,
    group,
    type: 'code',
    track: 'panel',
    tier: 'senior' as const,
    repos: [],
    blocked_by: group === 'blocked' ? ['T1', 'T2'] : [],
    unblocks: 0,
    started,
    finished: null,
    next_step: group === 'in-progress' ? 'Step Q' : null,
    waiting_on: group === 'blocked' ? ['T1', 'T2'] : [],
  };
}

function status(tasks: ReturnType<typeof makeTask>[], run: { open: boolean } | null = null, done = 1) {
  return {
    progress: { done, total: 6, pct: Math.round((done / 6) * 100) },
    phases: [{ dir: 'phase-q', title: 'Phase Q', done, total: 6, in_progress: 0 }],
    tasks,
    parallel: [],
    run: run && { ...run, log: 'notes/run.md' },
  };
}

/** One plan per badge; the first has the four sections and every form of duration. */
function plans(): PlanInput[] {
  const tasks = [
    makeTask('T1', 'in-progress', '2026-11-14T11:30Z'),
    makeTask('T2', 'in-progress', '2026-11-14T09:10Z'),
    makeTask('T7', 'in-progress', '2026-11-14T10:00Z'),
    makeTask('T3', 'in-progress', '2026-11-12T09:00Z'),
    makeTask('T8', 'in-progress', '2026-11-12T12:00Z'),
    makeTask('T4', 'available'),
    makeTask('T5', 'owner'),
    makeTask('T6', 'blocked'),
    // It goes past one phase page: «mostrar mais» appears.
    ...Array.from({ length: 6 }, () => makeTask('T4', 'available')),
  ];
  return [
    { folder: 'zeta', name: 'Zeta', status: status(tasks) },
    { folder: 'qwx', name: 'Qwx', status: status([], null, 6) },
    { folder: 'rr', name: 'Rr', status: status([], { open: true }) },
    // Completed with the run still open: the badge says «concluído» and the pill, the open run.
    { folder: 'vv', name: 'Vv', status: status([], { open: true }, 6) },
    { folder: 'ss', name: 'Ss', status: status([makeTask('T1', 'in-progress', '2026-11-14T11:30Z')]) },
    { folder: 'uu', name: 'Uu', status: status([makeTask('T4', 'available')]) },
    // The reader error arrives by code, with the validation cause inside.
    { folder: 'oops', name: 'oops', error: { code: 'invalid', args: ['oops'], cause: { code: 'notText', args: ['oops'] } } },
    { folder: 'kx', name: 'Kx', error: { code: 'folderMissing', args: ['kx'] } },
  ];
}

const PLUGINS: PluginView[] = [
  { state: 'checking' },
  { state: 'installing' },
  { state: 'active-project', scope: 'project', newVersion: { registered: '1', folder: '2' } },
  { state: 'active-user', scope: 'user' },
  { state: 'inactive', scope: 'local' },
  { state: 'not-installed' },
  { state: 'error', error: 'oops' },
];

/** A missing required check and an optional one that asks for attention: the whole footer. */
const ENVIRONMENT: EnvironmentInput = {
  ok: false,
  checks: [
    { id: 'jq', status: 'missing', required: true, detail: 'oops' },
    { id: 'git', status: 'missing', required: false, detail: 'oops' },
  ],
};

/** One idea per state, with one, several and no questions and with an unknown count. */
const IDEAS = ideasView(
  [
    { file: '/ws/i1.md', slug: 'i1', title: 'Idq', status: 'open', openQuestions: 1, plan: null },
    { file: '/ws/i2.md', slug: 'i2', title: 'Idq', status: 'refining', openQuestions: 3, plan: null },
    { file: '/ws/i3.md', slug: 'i3', title: 'Idq', status: 'ready', openQuestions: 0, plan: null },
    { file: '/ws/i4.md', slug: 'i4', title: 'Idq', status: 'open', openQuestions: null, plan: null },
    { file: '/ws/i5.md', slug: 'i5', title: 'Idq', status: 'mapped', openQuestions: 0, plan: 'agent_plans/zeta/' },
    { file: '/ws/i6.md', slug: 'i6', title: 'Idq', status: 'invalid', openQuestions: null, plan: null },
  ],
  ['refine', 'map', 'open', 'new', 'folder'],
);

/** The texts between the tags, without spaces at the ends. */
function visibleStrings(html: string): string[] {
  return html
    .split(/<[^>]*>/)
    .map((s) => s.trim())
    .filter((s) => /\p{L}/u.test(s));
}

/** The pieces of each pt-BR text without the arguments, with at least one letter. */
const PT_PIECES = Object.values(ptBR)
  .flatMap((t) => t.split(/\{\d+\}/))
  .map((s) => s.trim())
  .filter((s) => /\p{L}{2}/u.test(s));

/** A plan with one task in each group and one duration of each form, so the detail popup uses every key. */
function detailPlan(): PlanView {
  const groups: TaskView['group'][] = [
    'done',
    'in-progress',
    'blocked',
    'owner',
    'draft',
    'available',
    'cancelled',
    'invalid',
    'abandoned',
    'abandoned',
  ];
  const durations = [5, 125, 120, 1440, 1500, null, null, null, null, null];
  const tasks: TaskView[] = groups.map((group, i) => ({
    id: `T${i + 1}`,
    title: 'Kx',
    file: 'phase-q/T1.md',
    group,
    type: 'Qwx',
    track: 'panel',
    tier: 'senior',
    repos: i === 0 ? ['Rr'] : [],
    blockedBy: i === 2 ? ['T1', 'T2', 'T99'] : [],
    waitingOn: i === 2 ? ['T2'] : [],
    unblocks: i === 1 ? ['T3'] : [],
    pendingUnblocks: 0,
    started: i < 5 ? '2026-11-14T11:30Z' : null,
    finished: i === 0 ? '2026-11-14T11:30Z' : null,
    nextStep: group === 'in-progress' ? 'Step Q' : null,
    phase: 'phase-q',
    depth: 0,
    duration: durations[i] ?? null,
    // The replaced cancelled task, the give-up root and the one that fell with it.
    ...(group === 'cancelled' ? { replacement: 'T1' } : {}),
    ...(i === 8 ? { ownerGiveUp: true as const } : {}),
    ...(i === 9 ? { giveUpRoot: 'T9' } : {}),
  }));
  return {
    id: 'zeta',
    name: 'Zeta',
    pct: 0,
    done: 0,
    total: tasks.length,
    phases: [
      { title: 'Phase Q', dir: 'phase-q', done: 0, total: tasks.length, pct: 0, inProgress: 0, abandoned: false, counts: {}, tasks },
    ],
    tasks,
    parallel: [],
  };
}

function fullOutput(X: Strings = XTEXT): string {
  const ofDetail = detailPlan();
  const abandoned: PlanView = { ...ofDetail, phases: ofDetail.phases.map((f) => ({ ...f, done: 0, total: 0, abandoned: true })) };
  const views = plans().map((p) => planView(p, NOW, X));
  const all = new Set(views.map((v) => v.id));
  const parts = [
    panelDocument({ nonce: 'n', script: 's', style: 'e', origin: 'o' }, X),
    render({ plans: [], updated: '10:42', strings: X }),
    render({ plans: views, updated: '10:42', expanded: all, loading: true, strings: X }),
    ...PLUGINS.map((plugin) => render({ plans: views, updated: '10:42', expanded: all, plugin, strings: X })),
    render({ plans: [], updated: '10:42', strings: X, environment: ENVIRONMENT }),
    render({ plans: views, updated: '10:42', expanded: all, strings: X, environment: ENVIRONMENT }),
    render({ plans: views, updated: '10:42', expanded: all, strings: X, ideas: IDEAS }),
    // The Now and Ideas tabs: only the active tab brings the body; Ideas also empty.
    render({ plans: views, updated: '10:42', expanded: all, strings: X, ideas: IDEAS, tab: 'now' }),
    render({ plans: views, updated: '10:42', expanded: all, strings: X, ideas: IDEAS, tab: 'ideas' }),
    // With Mapped open (closed by default): the plan link.
    render({
      plans: views,
      updated: '10:42',
      expanded: all,
      strings: X,
      ideas: IDEAS,
      tab: 'ideas',
      openPhases: { '\u0000ideas': ['mapped'] },
    }),
    render({ plans: views, updated: '10:42', expanded: all, strings: X, tab: 'ideas' }),
    // The «⋯» menu of each plan, open (only then does the HTML carry it).
    ...views.map((v) => render({ plans: views, updated: '10:42', expanded: all, strings: X, menuOpen: v.id })),
    // The detail popup, for each task of the test plan (one of each group and of each form of duration).
    ...detailPlan().tasks.map((t) => taskDetail(detailPlan(), t.id, X)),
    // The sublines of the cancelled and abandoned tasks, the abandoned phase in its block and, with a filter, back in the list.
    render({
      plans: [abandoned],
      updated: '10:42',
      expanded: new Set(['zeta']),
      strings: X,
      openPhases: {
        zeta: ['phase-q', '@abandoned'],
      },
      pages: { [pageKey('zeta', 'phase-q')]: 16 },
    }),
    render({
      plans: [abandoned],
      updated: '10:42',
      expanded: new Set(['zeta']),
      strings: X,
      filters: {
        q: 'kx',
        groups: [],
        track: '',
        tier: '',
      },
    }),
    // The search with a result, by status and by phase, and the one that finds nothing (status chips without a task, «n de m», «limpar»).
    render({
      plans: views,
      updated: '10:42',
      expanded: all,
      strings: X,
      filters: {
        q: 'kx',
        groups: ['available'],
        track: 'panel',
        tier: 'senior',
      },
      view: 'status',
    }),
    render({
      plans: views,
      updated: '10:42',
      expanded: all,
      strings: X,
      filters: {
        q: 'kx',
        groups: ['available'],
        track: '',
        tier: '',
      },
    }),
    render({
      plans: views,
      updated: '10:42',
      expanded: all,
      strings: X,
      filters: {
        q: 'kx',
        groups: ['cancelled', 'invalid'],
        track: '',
        tier: '',
      },
    }),
  ];
  return parts.join('\n');
}

describe('panel in the test language', () => {
  it('all visible text is in the test language or plan data', () => {
    const outside = visibleStrings(fullOutput()).filter((s) => !s.includes('x-test:') && !DATA.includes(s) && !/^[\d\s:%/—·]+$/.test(s));
    expect(outside).toEqual([]);
  });

  it('no pt-BR text appears, and the document carries lang="x-test"', () => {
    const html = fullOutput();
    // The test-language keys (`x-test:plugin.error`) contain pt-BR words; what is searched for is the rest.
    const visible = visibleStrings(html)
      .filter((s) => !DATA.includes(s))
      .join('\n')
      .replace(/x-test:[\w.-]+/g, '');
    expect(PT_PIECES.filter((p) => visible.includes(p))).toEqual([]);
    expect(html).toContain('lang="x-test"');
  });

  it('the plan reading error comes translated, with the cause and the arguments', () => {
    const html = fullOutput();
    expect(html).toContain('x-test:reader.invalid oops x-test:reader.notText oops');
    expect(html).toContain('x-test:reader.folderMissing kx');
  });

  it('the environment footer comes in the test language, with the ids as data', () => {
    const html = fullOutput();
    expect(html).toContain('x-test:footer.missing jq');
    expect(html).toContain('x-test:footer.attention git');
    expect(html).toContain('x-test:footer.hint');
  });

  it('the «Ideias» section comes in the test language, with title, plan and path as data', () => {
    const html = render({
      plans: [],
      updated: '10:42',
      strings: X,
      ideas: IDEAS,
      tab: 'ideas',
      openPhases: {
        '\u0000ideas': ['open', 'refining', 'ready', 'mapped', 'invalid'],
      },
    });
    for (const key of [
      'title',
      'state-open',
      'state-refining',
      'state-ready',
      'state-mapped',
      'state-invalid',
      'questionsUnknown',
      'refine',
      'createTasks',
      'open',
    ]) {
      expect(html).toContain(`x-test:ideas.${key}`);
    }
    expect(html).toContain('x-test:ideas.questions 3');
    expect(html).toContain('x-test:ideas.plan zeta');
    // The folder path (the card name) and the slugs are data, not text.
    const visible = visibleStrings(html)
      .filter((s) => !DATA.includes(s))
      .join('\n')
      .replace(/x-test:[\w.-]+/g, '');
    expect(PT_PIECES.filter((p) => visible.includes(p))).toEqual([]);
  });

  it('covers every table key the panel uses', () => {
    const html = fullOutput();
    // The panel areas; the others (notices, channel, agent…) belong to the extension.
    const ofPanel = Object.keys(xTest).filter((k) => PANEL_AREAS.includes(k.split('.')[0] ?? ''));
    const used = ofPanel.filter((k) => html.includes(`x-test:${k}`));
    expect(used.sort()).toEqual(ofPanel.sort());
  });
});

/** What English has the same as pt-BR because they are words of both languages. */
const SAME_IN_BOTH = [
  'Plan Relay',
  'Plan Relay:',
  'plugin',
  'Plugin',
  'task',
  'tasks',
  'sh',
  'git',
  'jq',
  'min',
  'h',
  'd',
  'Tier',
  'Repos',
];
const PT_EN_PIECES = PT_PIECES.filter((p) => !SAME_IN_BOTH.includes(p));

describe('panel in English', () => {
  const EN = stringsFor('en');
  const word = (p: string) => new RegExp(`(?<![\\p{L}])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u');

  it('no visible text is pt-BR (neither whole nor in pieces) and the document carries lang="en"', () => {
    expect(EN.language).toBe('en');
    const html = fullOutput(EN);
    const visible = visibleStrings(html);
    expect(visible.length).toBeGreaterThan(20);
    const ptValues = new Set(Object.values(ptBR).filter((v) => !SAME_IN_BOTH.includes(v)));
    expect(visible.filter((s) => ptValues.has(s))).toEqual([]);
    expect(PT_EN_PIECES.filter((p) => visible.some((s) => word(p).test(s)))).toEqual([]);
    expect(html).toContain('lang="en"');
  });

  it('the sections, buttons and badges use the English text', () => {
    const html = fullOutput(EN);
    for (const t of ['Ideas', 'Refine', 'Create tasks', 'Open', 'Run', 'Resume', 'Refresh', 'Install']) expect(html).toContain(t);
  });

  it('covers every table key the panel uses', () => {
    const html = fullOutput(EN);
    const ofPanel = Object.keys(ptBR).filter((k) => PANEL_AREAS.includes(k.split('.')[0] ?? '') && k !== 'document.reading');
    // The same text on both sides of the render does not prove the key; it is enough that the English of each one appears.
    const missing = ofPanel.filter((k) => {
      const text = EN.t(k as never, '\u0001', '\u0001')
        .split('\u0001')
        .map((x) => x.trim())
        .filter((x) => /\p{L}{2}/u.test(x));
      return !text.every((x) => html.includes(x.replace(/&/g, '&amp;').replace(/"/g, '&quot;')));
    });
    expect(missing).toEqual([]);
  });
});

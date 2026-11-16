import type { StatusMessage } from './messages';
import { readSaved, SAVED_VERSION } from './saved';
import {
  clearFilters,
  collapseAll,
  fromSaved,
  goToIdeaPlan,
  goToTask,
  isFieldName,
  receive,
  renderInput,
  selectTab,
  setField,
  setView,
  showMore,
  toSaved,
  toggleAdvanced,
  toggleCard,
  toggleChip,
  toggleGroup,
  toggleIdeasSection,
  toggleMenu,
  toggleNowSection,
  togglePhase,
  type PanelState,
} from './state';
import { groupsKey, IDEAS_KEY, nowKey, pageKey, PER_PAGE } from './render';
import { stringsFor } from '@plan-relay/i18n';
import { TASK_VIEW } from './testing/views';

const A = '/ws/agent_plans/a';
const B = '/ws/agent_plans/b';

const task = (id: string, group: string, phase: string) => ({
  ...TASK_VIEW,
  id,
  title: id,
  file: `${phase}/${id}.md`,
  phase,
  group,
  type: 'code',
  track: 'panel',
  tier: 'mid',
  repos: [],
  depth: 0,
  waitingOn: [],
  nextStep: null,
});

function plan(id: string, n = 2): StatusMessage['plans'][number] {
  const tasks = Array.from({ length: n }, (_, i) => task(`F1-${String(i + 1).padStart(2, '0')}`, 'available', 'p1'));
  const phase = { title: 'p1', dir: 'p1', done: 0, total: n, pct: 0, inProgress: 0, abandoned: false, counts: {}, tasks };
  return { id, name: id, pct: 0, done: 0, total: n, tasks, parallel: [], phases: [phase] } as unknown as StatusMessage['plans'][number];
}

const status = (...plans: StatusMessage['plans']): StatusMessage => ({ type: 'status', plans, updated: '10:42' });

/** The initial state with these changes. */
const at = (over: Partial<PanelState> = {}): PanelState => ({ ...fromSaved(readSaved(undefined)), ...over });

describe('the saved part of the state', () => {
  it('fromSaved and toSaved go there and back, with the version; menu, detail and the read in progress are not saved', () => {
    const s = at({ expanded: [A], last: status(plan(A)), menuOpen: A, loading: true, detail: { plan: A, id: 'F1-01' } });
    const saved = toSaved(s);
    expect(saved.version).toBe(SAVED_VERSION);
    expect(saved).not.toHaveProperty('menuOpen');
    expect(saved).not.toHaveProperty('loading');
    expect(saved).not.toHaveProperty('detail');
    expect(fromSaved(readSaved(JSON.parse(JSON.stringify(saved))))).toEqual({
      ...s,
      menuOpen: undefined,
      loading: false,
      detail: undefined,
    });
  });

  it('toSaved copies the lists: changing the saved one does not change the state', () => {
    const s = at({ expanded: [A], openPhases: { [A]: ['p1'] } });
    const saved = toSaved(s);
    saved.expanded.push(B);
    saved.openPhases[A]?.push('p2');
    expect(s.expanded).toEqual([A]);
    expect(s.openPhases[A]).toEqual(['p1']);
  });

  it('renderInput is nothing before the first status, and the state as render takes it after', () => {
    const strings = stringsFor('en');
    expect(renderInput(at(), strings, true)).toBeUndefined();
    const input = renderInput(at({ expanded: [A], last: status(plan(A)), advanced: true }), strings, false);
    expect(input).toMatchObject({ updated: '10:42', actionsInRow: false, tabBar: { advanced: true } });
    expect(input?.expanded?.has(A)).toBe(true);
  });
});

describe('host messages', () => {
  it('a new status prunes cards, phases, groups, pages, the menu and the detail of plans that disappeared', () => {
    const s = at({
      expanded: [A, B],
      openPhases: { [A]: ['p1'], [B]: ['p1'], [groupsKey(B)]: ['done'], [IDEAS_KEY]: ['open'] },
      pages: { [pageKey(B, 'p1')]: 16, [pageKey(A, 'p1')]: 16, now: 16 },
      menuOpen: B,
      detail: { plan: B, id: 'F1-01' },
    });
    const next = receive(s, status(plan(A)));
    expect(next.expanded).toEqual([A]);
    expect(next.openPhases).toEqual({ [A]: ['p1'], [IDEAS_KEY]: ['open'] });
    expect(next.pages).toEqual({ [pageKey(A, 'p1')]: 16, now: 16 });
    expect(next.menuOpen).toBeUndefined();
    expect(next.detail).toBeUndefined();
    expect(s.expanded).toEqual([A, B]);
  });

  it('the detail of a task still in the plan stays; one that left the plan closes', () => {
    const s = at({ detail: { plan: A, id: 'F1-02' } });
    expect(receive(s, status(plan(A))).detail).toEqual({ plan: A, id: 'F1-02' });
    expect(receive(s, status(plan(A, 1))).detail).toBeUndefined();
  });

  it('loading, plugin, environment and notices replace their field', () => {
    expect(receive(at(), { type: 'loading', active: true }).loading).toBe(true);
    expect(receive(at(), { type: 'plugin', plugin: { state: 'not-installed' } }).plugin).toEqual({ state: 'not-installed' });
    expect(receive(at(), { type: 'environment', environment: { ok: true, checks: [] } }).environment).toEqual({ ok: true, checks: [] });
    expect(receive(at(), { type: 'notices', notices: ['x'] }).notices).toEqual(['x']);
  });
});

describe('tabs, menu and collapse', () => {
  it('a new tab closes the advanced part and the menu; the same tab keeps the advanced part', () => {
    const s = at({ tab: 'plans', advanced: true, menuOpen: A });
    expect(selectTab(s, 'now')).toMatchObject({ tab: 'now', advanced: false, menuOpen: undefined });
    expect(selectTab(s, 'plans')).toMatchObject({ tab: 'plans', advanced: true, menuOpen: undefined });
  });

  it('the menu toggles per plan', () => {
    expect(toggleMenu(at(), A).menuOpen).toBe(A);
    expect(toggleMenu(at({ menuOpen: A }), A).menuOpen).toBeUndefined();
    expect(toggleMenu(at({ menuOpen: A }), B).menuOpen).toBe(B);
  });

  it('«Collapse all» closes the phases of every plan and selects Plans', () => {
    const s = at({ tab: 'now', advanced: true, last: status(plan(A), plan(B)), openPhases: { [A]: ['p1'], [IDEAS_KEY]: ['open'] } });
    expect(collapseAll(s)).toMatchObject({ tab: 'plans', advanced: false, openPhases: { [A]: [], [B]: [], [IDEAS_KEY]: ['open'] } });
  });
});

describe('cards, phases and sections', () => {
  it('a card toggles', () => {
    expect(toggleCard(at(), A).expanded).toEqual([A]);
    expect(toggleCard(at({ expanded: [A, B] }), A).expanded).toEqual([B]);
  });

  it('a phase without a choice starts from the ones open by default; the first choice saves the list', () => {
    const s = at({ last: status(plan(A)) });
    const closed = togglePhase(s, A, 'p1');
    expect(closed.openPhases[A]).toEqual([]);
    expect(togglePhase(closed, A, 'p1').openPhases[A]).toEqual(['p1']);
    expect(togglePhase(at(), 'unknown', 'p9').openPhases.unknown).toEqual(['p9']);
  });

  it('groups, Now sections and Ideas sections toggle under their own key, from their own default', () => {
    expect(toggleGroup(at(), A, 'done').openPhases[groupsKey(A)]).toContain('done');
    expect(toggleNowSection(at(), A, 'available').openPhases[nowKey(A)]).not.toContain('available');
    expect(toggleIdeasSection(at(), 'mapped').openPhases[IDEAS_KEY]).toContain('mapped');
    expect(toggleIdeasSection(at(), 'open').openPhases[IDEAS_KEY]).not.toContain('open');
  });

  it('«show more» adds a page', () => {
    const once = showMore(at(), A, 'p1');
    expect(once.pages[pageKey(A, 'p1')]).toBe(2 * PER_PAGE);
    expect(showMore(once, A, 'p1').pages[pageKey(A, 'p1')]).toBe(3 * PER_PAGE);
  });
});

describe('filters', () => {
  it('a chip applies to the active tab: groups in Now and Plans, idea states in Ideas, nothing elsewhere', () => {
    expect(toggleChip(at({ tab: 'now' }), { group: 'owner' }).filters.now.groups).toEqual(['owner']);
    expect(toggleChip(at({ tab: 'plans' }), { group: 'owner' }).filters.plans.groups).toEqual(['owner']);
    expect(toggleChip(at({ tab: 'ideas' }), { status: 'ready' }).filters.ideas.states).toEqual(['ready']);
    const ideas = at({ tab: 'ideas' });
    expect(toggleChip(ideas, { group: 'owner' })).toBe(ideas);
    const plans = at({ tab: 'plans' });
    expect(toggleChip(plans, { status: 'ready' })).toBe(plans);
    expect(toggleChip(toggleChip(plans, { group: 'owner' }), { group: 'owner' }).filters.plans.groups).toEqual([]);
  });

  it('the search goes to the active tab, the plan selector to Now, track and tier to Plans', () => {
    expect(setField(at({ tab: 'ideas' }), 'q', 'x').filters.ideas.q).toBe('x');
    expect(setField(at({ tab: 'now' }), 'plan', A).filters.now.plan).toBe(A);
    expect(setField(at(), 'track', 'ci').filters.plans.track).toBe('ci');
    expect(setField(at(), 'tier', 'senior').filters.plans.tier).toBe('senior');
    expect([isFieldName('q'), isFieldName('plan'), isFieldName('other'), isFieldName(undefined)]).toEqual([true, true, false, false]);
  });

  it('«clear» empties only the active tab', () => {
    const s = setField(setField(at({ tab: 'now' }), 'q', 'a'), 'track', 'ci');
    const now = clearFilters(s);
    expect(now.filters.now.q).toBe('');
    expect(now.filters.plans.track).toBe('ci');
    expect(clearFilters({ ...s, tab: 'plans' }).filters.plans.track).toBe('');
    expect(clearFilters({ ...toggleChip(at({ tab: 'ideas' }), { status: 'open' }) }).filters.ideas.states).toEqual([]);
  });

  it('the funnel and the grouping', () => {
    expect(toggleAdvanced(at()).advanced).toBe(true);
    expect(setView(at(), 'status').view).toBe('status');
  });
});

describe('going to a task', () => {
  const ten = plan(A, 10);

  it('to the row: Plans, the card, the phase and the page up to the task; the detail closes', () => {
    const s = at({ tab: 'now', advanced: true, last: status(ten), openPhases: { [A]: [] }, detail: { plan: A, id: 'F1-01' } });
    const go = goToTask(s, { plan: A, id: 'F1-10' });
    expect(go.to).toBe('row');
    expect(go.state).toMatchObject({ tab: 'plans', advanced: false, expanded: [A], openPhases: { [A]: ['p1'] }, detail: undefined });
    expect(go.state.pages[pageKey(A, 'p1')]).toBe(2 * PER_PAGE);
    expect(goToTask(at({ last: status(ten) }), { plan: A, id: 'F1-01' }).state.pages).toEqual({});
  });

  it('a task the filters hide opens in the detail; one that is not in the plan changes nothing', () => {
    const s = setField(at({ last: status(ten) }), 'q', 'nothing matches');
    expect(goToTask(s, { plan: A, id: 'F1-02' })).toMatchObject({ to: 'detail', state: { detail: { plan: A, id: 'F1-02' } } });
    const none = goToTask(s, { plan: A, id: 'F9-99' });
    expect(none.to).toBe('none');
    expect(none.state).toBe(s);
  });

  it('the plan of a mapped idea: Plans with its card open; an unknown plan, only the tab', () => {
    const s = at({ tab: 'ideas', last: status(plan(A)) });
    expect(goToIdeaPlan(s, 'agent_plans/a')).toMatchObject({ id: A, state: { tab: 'plans', expanded: [A] } });
    expect(goToIdeaPlan(s, 'agent_plans/zz')).toMatchObject({ id: undefined, state: { tab: 'plans', expanded: [] } });
  });
});

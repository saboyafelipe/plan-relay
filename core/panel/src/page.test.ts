// @vitest-environment happy-dom
import { within } from '@testing-library/dom';
import { clickOf, readSaved, SEARCH_DELAY_MS, type Saved } from './page';
import { byData, mountPanel, type MountedPanel } from './testing/panel-dom';
import { TASK_VIEW } from './testing/views';

afterEach(() => {
  vi.restoreAllMocks();
});

const view = (p: MountedPanel) => within(p.root);

/** The `aria-expanded` of the drawn control with these `data-*`. */
const expanded = (p: MountedPanel, data: Record<string, string>) => p.control(data).getAttribute('aria-expanded');

/**
 * The layout a browser would compute. happy-dom lays nothing out, so the heights, widths and boxes the page measures
 * come from `box`: the tab row and the filter bar (height and base in the window), the pinned plan strip (`band`), the
 * chip row widths, and the top of any other element by its `data-id`, `data-phase` or `data-action` (200 by default).
 */
function fakeLayout() {
  const box = {
    tabsHeight: 0,
    tabsBottom: 0,
    filtersHeight: 0,
    filtersBottom: 0,
    band: 0,
    chipsScroll: 0,
    chipsClient: 0,
    top: new Map<string, number>(),
  };
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    if (this.matches('.tabs')) return box.tabsHeight;
    if (this.matches('.filters')) return box.filtersHeight;
    return 0;
  });
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
    return this.matches('.chips') ? box.chipsScroll : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.matches('.chips') ? box.chipsClient : 0;
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.matches('.tabs')) return new DOMRect(0, 0, 0, box.tabsBottom);
    if (this.matches('.filters')) return new DOMRect(0, 0, 0, box.filtersBottom);
    if (this.matches('.plan > .header')) return new DOMRect(0, 0, 0, box.band);
    const key = this.getAttribute('data-id') ?? this.getAttribute('data-phase') ?? this.getAttribute('data-action') ?? '';
    return new DOMRect(0, box.top.get(key) ?? 200, 0, 22);
  });
  const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
  return { box, scrolls: () => scrollBy.mock.calls.map((c) => c[1]) };
}

describe('clickOf', () => {
  it('translates each complete action', () => {
    expect(clickOf({ action: 'toggle', plan: 'p' })).toEqual({ type: 'toggle', plan: 'p' });
    expect(clickOf({ action: 'refresh' })).toEqual({ type: 'refresh' });
    expect(clickOf({ action: 'install' })).toEqual({ type: 'install' });
    expect(clickOf({ action: 'delete', plan: 'p' })).toEqual({ type: 'delete', plan: 'p' });
    expect(clickOf({ action: 'execute', plan: 'p', id: 'F1-01' })).toEqual({ type: 'execute', plan: 'p', id: 'F1-01' });
    expect(clickOf({ action: 'run', plan: 'p' })).toEqual({ type: 'run', plan: 'p' });
    expect(clickOf({ action: 'giveUp', plan: 'p', id: 'F1-01' })).toEqual({ type: 'giveUp', plan: 'p', id: 'F1-01' });
    expect(clickOf({ action: 'reopen', plan: 'p', id: 'F1-01' })).toEqual({ type: 'reopen', plan: 'p', id: 'F1-01' });
    expect(clickOf({ action: 'open', plan: 'p', file: 'MAP.md' })).toEqual({ type: 'open', plan: 'p', file: 'MAP.md' });
  });

  it('an incomplete or unknown action gives nothing', () => {
    for (const d of [
      {},
      { action: 'toggle' },
      { action: 'delete' },
      { action: 'execute', plan: 'p' },
      { action: 'giveUp', plan: 'p' },
      { action: 'reopen', id: 'F1-01' },
      { action: 'open', plan: 'p' },
      { action: 'other', plan: 'p' },
    ]) {
      expect(clickOf(d), JSON.stringify(d)).toBeUndefined();
    }
  });
});

const STATUS = { type: 'status', plans: [], updated: '10:42' };
const PLAN = { id: '/ws/agent_plans/a', name: 'a', pct: 0, done: 0, total: 0, phases: [], tasks: [], parallel: [] };
const WITH_PLAN = { ...STATUS, plans: [PLAN] };

describe('bindPanel', () => {
  it('tells the host it is ready and draws the incoming status', () => {
    const p = mountPanel();
    expect(p.sent.filter((m) => m.type !== 'tab')).toEqual([{ type: 'ready' }]);
    p.receive(STATUS);
    expect(view(p).getByRole('img', { name: /Atualizado às 10:42/ })).toBeTruthy();
    expect(p.savedList.at(-1)).toMatchObject({ last: STATUS });
  });

  it('the incoming environment draws the footer and is kept for the view that reappears', () => {
    const environment = { ok: false, checks: [{ id: 'jq', status: 'missing', required: true, detail: 'x' }] };
    const p = mountPanel();
    p.receive(STATUS);
    p.receive({ type: 'environment', environment });
    expect(p.root.textContent).toContain('Falta no ambiente: jq');
    expect(p.savedList.at(-1)).toMatchObject({ environment });
    const other = mountPanel({ expanded: [], last: STATUS as Saved['last'], environment: environment as Saved['environment'] });
    expect(other.root.textContent).toContain('Falta no ambiente: jq');
  });

  it('the host notices are drawn at the top and kept for the view that reappears', () => {
    const p = mountPanel();
    p.receive(STATUS);
    p.receive({ type: 'notices', notices: ['extensão velha'] });
    expect(p.root.querySelector('.host-notice')?.textContent).toBe('extensão velha');
    // The live region says it (a region drawn with the notice would not be read).
    expect(view(p).getByRole('status').textContent).toBe('extensão velha');
    expect(p.savedList.at(-1)).toMatchObject({ notices: ['extensão velha'] });
    const other = mountPanel({ expanded: [], last: STATUS as Saved['last'], notices: ['extensão velha'] });
    expect(other.root.querySelector('.host-notice')?.textContent).toBe('extensão velha');
    other.receive({ type: 'notices', notices: [] });
    expect(other.root.querySelector('.host-notice')).toBeNull();
  });

  it('ignores what is not a host message', () => {
    const p = mountPanel();
    p.receive({ type: 'other' });
    expect(p.root.innerHTML).toBe('');
    expect(p.savedList).toEqual([]);
  });

  it('«Atualizar» sends the message once and disables the button until the load ends', () => {
    const p = mountPanel({ expanded: [], last: STATUS as Saved['last'] });
    p.click({ action: 'refresh' });
    p.click({ action: 'refresh' });
    expect(p.sent.filter((m) => m.type === 'refresh')).toHaveLength(1);
    expect((p.control({ action: 'refresh' }) as HTMLButtonElement).disabled).toBe(true);
    p.receive({ type: 'loading', active: false });
    const button = view(p).getByRole<HTMLButtonElement>('button', { name: 'Atualizar' });
    expect(button.disabled).toBe(false);
  });

  it('toggling a card stays in the page and is saved', () => {
    const p = mountPanel({ expanded: [], last: WITH_PLAN });
    p.click({ action: 'toggle', plan: PLAN.id });
    expect(p.sent.filter((m) => m.type !== 'tab')).toEqual([{ type: 'ready' }]);
    expect(p.savedList.at(-1)?.expanded).toEqual([PLAN.id]);
    expect(expanded(p, { action: 'toggle', plan: PLAN.id })).toBe('true');
  });

  it('cards of plans that disappeared stop being saved as open', () => {
    const p = mountPanel({ expanded: ['/ws/agent_plans/old'] });
    p.receive(STATUS);
    expect(p.savedList.at(-1)?.expanded).toEqual([]);
  });

  it('a saved state of another shape is dropped and the page still says it is ready', () => {
    // From before the versions (`version: undefined`), of this version but another shape, and of an unknown version.
    for (const saved of [
      { version: undefined, ultimo: { planos: [] } },
      { version: undefined, ultimo: { plans: {} } },
      { last: { planos: [] } },
      { last: { plans: {} } },
      { last: { ...STATUS, plans: [{ id: 'p' }] } },
      { version: 999, last: STATUS },
    ]) {
      const p = mountPanel(saved);
      expect(
        p.sent.filter((m) => m.type !== 'tab'),
        JSON.stringify(saved),
      ).toEqual([{ type: 'ready' }]);
      expect(p.root.innerHTML).toBe('');
      p.receive(STATUS);
      expect(p.savedList.at(-1)).toMatchObject({ version: 3, last: STATUS });
    }
  });

  it('dispose removes the listeners of the root, the document, the window and the channel, and the pending search', () => {
    vi.useFakeTimers();
    try {
      const p = mountPanel({ expanded: [PLAN.id], last: WITH_PLAN });
      const { root } = p;
      const removed = [root, document, window].map((t) => vi.spyOn(t, 'removeEventListener'));
      p.type('q', 'x');
      p.dispose();
      const types = removed.map((spy) => spy.mock.calls.map((c) => c[0]).sort());
      expect(types).toEqual([['change', 'click', 'compositionend', 'focusin', 'input', 'keydown'], ['keydown'], ['resize', 'scroll']]);
      vi.advanceTimersByTime(SEARCH_DELAY_MS);
      const html = root.innerHTML;
      p.click({ action: 'toggle', plan: PLAN.id });
      p.receive(STATUS);
      root.querySelector('[data-action="toggle"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(root.innerHTML).toBe(html);
      expect(p.savedList).toEqual([]);
      expect(p.sent.filter((m) => m.type !== 'tab')).toEqual([{ type: 'ready' }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the card actions go to the host', () => {
    const p = mountPanel({ expanded: [PLAN.id], last: WITH_PLAN });
    p.click({ action: 'run', plan: PLAN.id });
    expect(p.sent.at(-1)).toEqual({ type: 'run', plan: PLAN.id });
    p.click({ action: 'open', plan: PLAN.id, file: 'MAP.md' });
    expect(p.sent.at(-1)).toEqual({ type: 'open', plan: PLAN.id, file: 'MAP.md' });
  });
});

describe('phases in an accordion', () => {
  const ID = '/ws/agent_plans/a';
  const task = (id: string, group: string) => ({
    ...TASK_VIEW,
    id,
    title: id,
    file: `p0/${id}.md`,
    group,
    tier: 'mid',
    depth: 0,
    waitingOn: [],
    nextStep: null,
  });
  const phase = (dir: string, tasks: ReturnType<typeof task>[]) => ({
    title: dir,
    dir,
    done: 0,
    total: tasks.length,
    pct: 0,
    inProgress: 0,
    counts: {},
    abandoned: false,
    tasks,
  });
  const more = Array.from({ length: 30 }, (_, i) => task(`F1-${String(i + 1).padStart(2, '0')}`, 'available'));
  const STATUS_PHASES = {
    ...STATUS,
    plans: [
      {
        id: ID,
        name: 'a',
        pct: 0,
        done: 0,
        total: 0,
        tasks: [],
        parallel: [],
        phases: [phase('p0', [task('F0-01', 'in-progress')]), phase('p1', more)],
      },
    ],
  };
  const isOpen = () => mountPanel({ expanded: [ID], last: STATUS_PHASES });
  const phaseOf = (p: MountedPanel, dir: string) => expanded(p, { action: 'phase', plan: ID, phase: dir });

  it('clickOf translates phase and more, and refuses the incomplete', () => {
    expect(clickOf({ action: 'phase', plan: 'p', phase: 'p0' })).toEqual({ type: 'phase', plan: 'p', phase: 'p0' });
    expect(clickOf({ action: 'more', plan: 'p', phase: 'p0' })).toEqual({ type: 'more', plan: 'p', phase: 'p0' });
    for (const d of [
      { action: 'phase', plan: 'p' },
      { action: 'phase', phase: 'p0' },
      { action: 'more', plan: 'p' },
    ])
      expect(clickOf(d), JSON.stringify(d)).toBeUndefined();
  });

  it('the in-progress phase opens by itself; the click opens the other and the first choice saves the whole list', () => {
    const p = isOpen();
    expect(phaseOf(p, 'p0')).toBe('true');
    expect(phaseOf(p, 'p1')).toBe('false');
    p.click({ action: 'phase', plan: ID, phase: 'p1' });
    expect(p.savedList.at(-1)?.openPhases).toEqual({ [ID]: ['p0', 'p1'] });
    expect(phaseOf(p, 'p1')).toBe('true');
    expect(p.sent.filter((m) => m.type !== 'tab')).toEqual([{ type: 'ready' }]);
    p.click({ action: 'phase', plan: ID, phase: 'p0' });
    expect(p.savedList.at(-1)?.openPhases).toEqual({ [ID]: ['p1'] });
    expect(phaseOf(p, 'p0')).toBe('false');
  });

  it('«mostrar mais» adds 8 tasks and saves the page', () => {
    const p = isOpen();
    p.click({ action: 'phase', plan: ID, phase: 'p1' });
    expect(p.root.querySelectorAll('li.ln')).toHaveLength(9);
    // The page key carries the plan and the phase; only p1 has more to show.
    p.click({ action: 'more', plan: ID });
    expect(p.root.querySelectorAll('li.ln')).toHaveLength(17);
    expect(Object.values(p.savedList.at(-1)?.pages ?? {})).toEqual([16]);
    // 24, then the last 6 of the 30: the button goes away with nothing left to show.
    p.click({ action: 'more', plan: ID });
    p.click({ action: 'more', plan: ID });
    expect(p.root.querySelectorAll('li.ln')).toHaveLength(31);
    expect(p.has({ action: 'more' })).toBe(false);
    expect(p.sent.filter((m) => m.type !== 'tab')).toEqual([{ type: 'ready' }]);
  });

  it('the common row stays navigable: the body is the only treeitem of the row and matches the origin of the detail focus', () => {
    const p = isOpen();
    p.click({ action: 'phase', plan: ID, phase: 'p1' });
    const lines = [...p.root.querySelectorAll('li.ln')];
    expect(lines.length).toBeGreaterThan(0);
    for (const li of lines) {
      // Only the body enters the roving tabindex; the row buttons (hover and ▶) stay out of it.
      const items = li.querySelectorAll('[role="treeitem"]');
      expect(items).toHaveLength(1);
      const body = items[0] as HTMLElement;
      expect(body.matches('button.ln-body[data-action="detail"][data-plan][data-id]')).toBe(true);
      expect(body.getAttribute('tabindex')).toBe('-1');
      for (const b of li.querySelectorAll('button.ib')) expect(b.getAttribute('tabindex')).toBe('-1');
    }
  });

  it('the open phases come back when the view reappears, and the «Recolher tudo» message closes all of them', () => {
    const p = mountPanel({ expanded: [ID], last: STATUS_PHASES, openPhases: { [ID]: ['p1'] } });
    expect(phaseOf(p, 'p1')).toBe('true');
    expect(phaseOf(p, 'p0')).toBe('false');
    p.receive({ type: 'collapseAll' });
    expect(phaseOf(p, 'p1')).toBe('false');
    expect(p.savedList.at(-1)?.openPhases).toEqual({ [ID]: [] });
  });

  it('«Recolher tudo» in the Plans header closes the phases like the title bar one, without going to the host', () => {
    const p = mountPanel({ expanded: [ID], last: STATUS_PHASES, openPhases: { [ID]: ['p1'] } });
    expect(clickOf({ action: 'collapse-all' })).toEqual({ type: 'collapseAll' });
    p.click(view(p).getByRole('button', { name: 'Recolher tudo' }));
    expect(phaseOf(p, 'p1')).toBe('false');
    expect(p.savedList.at(-1)?.openPhases).toEqual({ [ID]: [] });
    expect(p.sent.filter((m) => m.type !== 'tab')).toEqual([{ type: 'ready' }]);
  });

  it('the «Fases concluídas» block opens and closes per plan, and «Recolher tudo» closes it', () => {
    const done = { ...phase('p9', [task('F9-01', 'done')]), done: 1, pct: 100 };
    const status = {
      ...STATUS_PHASES,
      plans: [{ ...STATUS_PHASES.plans[0], phases: [done, phase('p0', [task('F0-01', 'in-progress')])] }],
    };
    const p = mountPanel({ expanded: [ID], last: status });
    expect(phaseOf(p, '@done')).toBe('false');
    p.click({ action: 'phase', plan: ID, phase: '@done' });
    expect(phaseOf(p, '@done')).toBe('true');
    expect(p.savedList.at(-1)?.openPhases).toEqual({ [ID]: ['p0', '@done'] });
    p.click({ action: 'collapse-all' });
    expect(phaseOf(p, '@done')).toBe('false');
  });

  it('a plan that disappeared takes its page out of the saved state', () => {
    const p = mountPanel({ expanded: [], pages: { [`/ws/old\u0000p0`]: 24, [`${ID}\u0000p1`]: 24 }, last: STATUS_PHASES });
    p.receive(STATUS_PHASES);
    expect(Object.keys(p.savedList.at(-1)?.pages ?? {})).toEqual([`${ID}\u0000p1`]);
  });
});

describe('sections and card menu', () => {
  const tab = (p: MountedPanel, name: RegExp) => view(p).getByRole('tab', { name });
  const menu = (p: MountedPanel) => view(p).queryByRole('menu');

  it('clickOf translates tab, menu and copy, and refuses the incomplete or the unknown tab', () => {
    expect(clickOf({ action: 'tab', tab: 'ideas' })).toEqual({ type: 'tab', tab: 'ideas' });
    expect(clickOf({ action: 'menu', plan: 'p' })).toEqual({ type: 'menu', plan: 'p' });
    expect(clickOf({ action: 'copy', plan: 'p' })).toEqual({ type: 'copy', plan: 'p' });
    for (const d of [
      { action: 'tab' },
      { action: 'tab', tab: 'other' },
      { action: 'section', section: 'plans' },
      { action: 'menu' },
      { action: 'copy' },
    ])
      expect(clickOf(d), JSON.stringify(d)).toBeUndefined();
  });

  it('a click on a tab switches the panel, stays in the page and is saved as the tab', () => {
    const p = mountPanel();
    p.receive(WITH_PLAN);
    expect(p.has({ action: 'toggle', plan: PLAN.id })).toBe(true);
    p.click(tab(p, /Ideias/));
    expect(p.savedList.at(-1)?.tab).toBe('ideas');
    expect(tab(p, /Ideias/).getAttribute('aria-selected')).toBe('true');
    expect(p.has({ action: 'toggle' })).toBe(false);
    expect(p.sent).toEqual([{ type: 'ready' }, { type: 'tab', tab: 'plans' }, { type: 'tab', tab: 'ideas' }]);
    p.click(tab(p, /Planos/));
    expect(p.savedList.at(-1)?.tab).toBe('plans');
    expect(p.has({ action: 'toggle', plan: PLAN.id })).toBe(true);
  });

  it('tells the host the active tab on bind and on every switch, by click or by keyboard', () => {
    const p = mountPanel({ expanded: [], tab: 'now', last: WITH_PLAN });
    expect(p.sent).toEqual([{ type: 'ready' }, { type: 'tab', tab: 'now' }]);
    p.click(tab(p, /Ideias/));
    expect(p.sent.at(-1)).toEqual({ type: 'tab', tab: 'ideas' });
    // Clicking the tab that is already active does not repeat the notice.
    p.click(tab(p, /Ideias/));
    expect(p.sent.filter((m) => m.type === 'tab')).toHaveLength(2);
    // The host «Filter» stays on the active tab: nothing to report.
    p.receive({ type: 'filter' });
    expect(p.sent.filter((m) => m.type === 'tab')).toHaveLength(2);
    // The host «Collapse all» selects Plans: the host gets to know that too.
    p.receive({ type: 'collapseAll' });
    expect(p.sent.at(-1)).toEqual({ type: 'tab', tab: 'plans' });
  });

  it('with actionsInRow: false (host with a title bar), the row comes out without the actions', () => {
    const p = mountPanel({ expanded: [], tab: 'plans', last: WITH_PLAN }, { actionsInRow: false });
    expect(view(p).getByRole('tablist')).toBeTruthy();
    expect(view(p).queryByRole('button', { name: 'Atualizar' })).toBeNull();
    expect(view(p).queryByRole('img', { name: /Atualizado às/ })).toBeNull();
    const withActions = mountPanel({ expanded: [], tab: 'plans', last: WITH_PLAN });
    expect(view(withActions).getByRole('button', { name: 'Atualizar' })).toBeTruthy();
  });

  it('the chosen tab comes back when the view reappears', () => {
    const p = mountPanel({ expanded: [], tab: 'now', last: WITH_PLAN });
    expect(tab(p, /Agora/).getAttribute('aria-selected')).toBe('true');
    expect(p.has({ action: 'toggle' })).toBe(false);
  });

  it('arrows, Home and End move focus between the tabs and select, wrapping at the ends', () => {
    const p = mountPanel({ expanded: [], last: WITH_PLAN });
    const steps: [string, string, string][] = [
      ['plans', 'ArrowRight', 'ideas'],
      ['ideas', 'ArrowRight', 'now'],
      ['now', 'ArrowLeft', 'ideas'],
      ['ideas', 'ArrowLeft', 'plans'],
      ['plans', 'Home', 'now'],
      ['now', 'End', 'ideas'],
    ];
    for (const [from, key, to] of steps) {
      expect(p.key(key, {}, p.control({ action: 'tab', tab: from })), `${from} ${key}`).toBe(true);
      expect(p.savedList.at(-1)?.tab, `${from} ${key}`).toBe(to);
      const selected = view(p).getByRole('tab', { selected: true });
      expect(selected.dataset['tab'], `${from} ${key}`).toBe(to);
      expect(document.activeElement, `${from} ${key}`).toBe(selected);
    }
    // Other keys on the tab do nothing.
    expect(p.key('ArrowDown', {}, p.control({ action: 'tab', tab: 'plans' }))).toBe(false);
    expect(p.savedList.at(-1)?.tab).toBe('ideas');
  });

  it('the menu opens on click, closes on Esc, on an outside click and on choosing an item, and does not go into the saved state', () => {
    const p = mountPanel();
    p.receive(WITH_PLAN);
    const button = () => p.control({ action: 'menu', plan: PLAN.id });
    expect(menu(p)).toBeNull();
    p.click(button());
    expect(menu(p)).not.toBeNull();
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(JSON.stringify(p.savedList.at(-1))).not.toContain('menuOpen');
    expect(p.key('Escape')).toBe(true);
    expect(menu(p)).toBeNull();
    // Esc returns focus to the «⋯» button.
    expect(document.activeElement).toBe(button());
    // Click outside.
    p.click(button());
    p.click({ action: 'refresh' });
    expect(menu(p)).toBeNull();
    // The same button twice opens and closes.
    p.click(button());
    p.click(button());
    expect(menu(p)).toBeNull();
    // Choosing an item closes the menu and the action goes on to the host.
    p.click(button());
    p.click(within(menu(p) as HTMLElement).getByRole('menuitem', { name: /Copiar/ }));
    expect(menu(p)).toBeNull();
    expect(p.sent.at(-1)).toEqual({ type: 'copy', plan: PLAN.id });
  });

  it('an outside click that lands on another button closes the menu and that button action goes on', () => {
    const p = mountPanel({ expanded: [PLAN.id], last: WITH_PLAN });
    p.click({ action: 'menu', plan: PLAN.id });
    p.click({ action: 'run', plan: PLAN.id });
    expect(menu(p)).toBeNull();
    expect(p.sent.at(-1)).toEqual({ type: 'run', plan: PLAN.id });
  });

  it('opening the menu focuses the first item; arrows, Home and End navigate the items in a loop', () => {
    const p = mountPanel();
    p.receive(WITH_PLAN);
    p.click({ action: 'menu', plan: PLAN.id });
    const items = within(menu(p) as HTMLElement).getAllByRole('menuitem');
    expect(items.length).toBeGreaterThan(2);
    const last = items.at(-1);
    expect(document.activeElement).toBe(items[0]);
    expect(p.key('ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(items[1]);
    p.key('End');
    expect(document.activeElement).toBe(last);
    p.key('ArrowDown');
    expect(document.activeElement).toBe(items[0]);
    p.key('ArrowUp');
    expect(document.activeElement).toBe(last);
    p.key('Home');
    expect(document.activeElement).toBe(items[0]);
    expect(p.key('a')).toBe(false);
  });

  it('the keys do nothing with the menu closed', () => {
    const p = mountPanel();
    p.receive(WITH_PLAN);
    expect(p.key('Escape', {}, p.root)).toBe(false);
    expect(p.key('ArrowDown', {}, p.root)).toBe(false);
  });

  it('the menu of a plan that disappeared closes on the next load', () => {
    const p = mountPanel();
    p.receive(WITH_PLAN);
    p.click({ action: 'menu', plan: PLAN.id });
    p.receive(STATUS);
    p.receive(WITH_PLAN);
    expect(menu(p)).toBeNull();
  });

  it('on scroll, the menu closes when the «⋯» button goes under the filter bar, and only then', () => {
    const { box } = fakeLayout();
    const p = mountPanel();
    p.receive(WITH_PLAN);
    box.filtersBottom = 60;
    p.click({ action: 'menu', plan: PLAN.id });
    // Scrolling with the button still in view does not close it (focus on the first item may also scroll the page).
    box.top.set('menu', 80);
    window.dispatchEvent(new Event('scroll'));
    expect(menu(p)).not.toBeNull();
    // The button went below the bar: the menu, which would sit over it, closes.
    box.top.set('menu', 50);
    window.dispatchEvent(new Event('scroll'));
    expect(menu(p)).toBeNull();
    // With no menu open, scrolling does not redraw.
    const html = p.root.innerHTML;
    window.dispatchEvent(new Event('scroll'));
    expect(p.root.innerHTML).toBe(html);
  });
});

describe('readSaved', () => {
  const INITIAL = {
    version: 3,
    expanded: [],
    tab: 'plans',
    openPhases: {},
    filters: {
      now: { q: '', groups: [], plan: '' },
      plans: { q: '', groups: [], track: '', tier: '' },
      ideas: { q: '', states: [] },
    },
    advanced: false,
    view: 'phase',
    pages: {},
  };

  it('nothing saved gives the initial state', () => {
    expect(readSaved(undefined)).toEqual(INITIAL);
    expect(readSaved(null)).toEqual(INITIAL);
    expect(readSaved('junk')).toEqual(INITIAL);
  });

  it('a saved state from before the tabs (with closedSections, no tab) opens on Plans and drops the sections', () => {
    const g = readSaved({ expanded: [], closedSections: ['plans', 'now'] });
    expect(g).toEqual(INITIAL);
    expect(g).not.toHaveProperty('closedSections');
  });

  it('a saved state from before the versions keeps the UI choices and drops the host data, which the host sends again', () => {
    const old = {
      expanded: ['/ws/agent_plans/a'],
      tab: 'now',
      vista: 'status',
      ultimo: STATUS,
      plugin: { status: 'inactive' },
      notices: ['x'],
    };
    expect(readSaved(old)).toEqual({ ...INITIAL, expanded: ['/ws/agent_plans/a'], tab: 'now', view: 'status' });
  });

  it('a saved state of version 1 carries its old keys over: the grouping and the last status', () => {
    const plugin = { state: 'not-installed' };
    const v1 = { version: 1, expanded: ['p'], tab: 'ideas', vista: 'status', ultimo: STATUS, plugin, notices: ['x'] };
    expect(readSaved(v1)).toEqual({ ...INITIAL, expanded: ['p'], tab: 'ideas', view: 'status', last: STATUS, plugin, notices: ['x'] });
    expect(readSaved({ version: 1, view: 'status', last: STATUS })).toEqual(INITIAL);
  });

  it('a saved state of this version keeps the host data only in the shape the page draws', () => {
    const environment = { ok: true, checks: [] };
    const plugin = { state: 'not-installed' };
    expect(readSaved({ version: 3, last: STATUS, plugin, environment })).toEqual({ ...INITIAL, last: STATUS, plugin, environment });
    const bad = readSaved({
      version: 3,
      last: { ...STATUS, plans: [{ id: 'p' }] },
      plugin: { status: 'inactive' },
      environment: { ok: 1 },
    });
    expect(bad).toEqual(INITIAL);
    expect(readSaved({ version: 3, vista: 'status', ultimo: STATUS })).toEqual(INITIAL);
  });

  it('a saved state of a version this page does not know gives the initial state', () => {
    expect(readSaved({ version: 4, expanded: ['p'], tab: 'ideas', last: STATUS })).toEqual(INITIAL);
  });

  it('a saved state of version 2 or earlier carries its Portuguese open-block keys over, once', () => {
    const A = '/ws/agent_plans/a';
    const v2 = {
      version: 2,
      openPhases: {
        [A]: ['p1', '@concluidas', '@abandonadas'],
        [`${A}\u0000estado`]: ['done'],
        [`${A}\u0000agora`]: ['available'],
        '\u0000ideias': ['mapped'],
      },
      pages: { [`${A}\u0000agora:available`]: 16, [`${A}\u0000p1`]: 24 },
    };
    const renamed = {
      openPhases: {
        [A]: ['p1', '@done', '@abandoned'],
        [`${A}\u0000status`]: ['done'],
        [`${A}\u0000now`]: ['available'],
        '\u0000ideas': ['mapped'],
      },
      pages: { [`${A}\u0000now:available`]: 16, [`${A}\u0000p1`]: 24 },
    };
    expect(readSaved(v2)).toEqual({ ...INITIAL, ...renamed });
    expect(readSaved({ ...v2, version: 1 })).toEqual({ ...INITIAL, ...renamed });
    // In this version the names are read as they are: a phase folder may be called anything.
    expect(readSaved({ ...v2, version: 3 })).toEqual({ ...INITIAL, openPhases: v2.openPhases, pages: v2.pages });
  });

  it('the new saved state comes back as it was', () => {
    const fresh: Saved = {
      version: 3,
      expanded: ['p'],
      tab: 'ideas',
      openPhases: { p: ['phase-1-a', 'phase-2-b'] },
      filters: {
        now: { q: 'a', groups: ['owner'], plan: 'p' },
        plans: { q: 'busca', groups: ['blocked', 'owner'], track: 'panel', tier: 'mid' },
        ideas: { q: 'i', states: ['ready', 'mapped'] },
      },
      advanced: true,
      view: 'status',
      pages: { 'phase-1-a': 24 },
      notices: ['x'],
    };
    expect(readSaved(JSON.parse(JSON.stringify(fresh)))).toEqual(fresh);
  });

  it('what came with another type takes the default; what is extra is ignored', () => {
    const g = readSaved({
      expanded: 'p',
      tab: 'grid',
      openPhases: { p: 'phase-1', q: ['phase-2', null] },
      filters: { q: 7, groups: ['blocked', 'other'], track: null },
      vista: 'grid',
      pages: { a: 24, b: -1, c: 1.5, d: '12' },
      other: true,
    });
    expect(g).toEqual({
      ...INITIAL,
      openPhases: { p: [], q: ['phase-2'] },
      filters: { ...INITIAL.filters, plans: { q: '', groups: ['blocked'], track: '', tier: '' } },
      pages: { a: 24 },
    });
  });

  it('the old format (filters only for Plans) becomes the Plans filters; the other tabs start empty', () => {
    const g = readSaved({ filters: { q: 'f8', groups: ['owner'], track: 'ci', tier: '' } });
    expect(g.filters).toEqual({ ...INITIAL.filters, plans: { q: 'f8', groups: ['owner'], track: 'ci', tier: '' } });
  });

  it('in the new format, what came with another type in each tab takes the default', () => {
    const g = readSaved({
      filters: { now: { q: 1, groups: ['done', 'x'], plan: 3 }, plans: 'x', ideas: { states: ['open', 'other', 'invalid'] } },
      advanced: 'yes',
    });
    expect(g.filters).toEqual({
      now: { q: '', groups: ['done'], plan: '' },
      plans: { q: '', groups: [], track: '', tier: '' },
      ideas: { q: '', states: ['open', 'invalid'] },
    });
    expect(g.advanced).toBe(false);
  });
});

describe('bindPanel with the panel v2 state', () => {
  it('an old saved state does not break the page: it draws and saves in the new shape', () => {
    const p = mountPanel({ version: 1, expanded: [PLAN.id], vista: 'status', ultimo: WITH_PLAN });
    expect(view(p).getByRole('img', { name: /Atualizado às 10:42/ })).toBeTruthy();
    p.click({ action: 'toggle', plan: PLAN.id });
    const saved = p.savedList.at(-1);
    expect(saved).toMatchObject({ version: 3, expanded: [], tab: 'plans', openPhases: {}, view: 'status', pages: {}, last: WITH_PLAN });
    expect(saved).not.toHaveProperty('vista');
    expect(saved).not.toHaveProperty('ultimo');
  });

  it('the saved UI state comes back on the next save; phases of plans that disappeared go away', () => {
    const p = mountPanel({
      expanded: [],
      tab: 'ideas',
      openPhases: { '/ws/agent_plans/a': ['phase-1'], '/ws/agent_plans/old': ['phase-2'] },
      filters: { q: 'x', groups: ['owner'], track: '', tier: '' },
      view: 'status',
      pages: { 'phase-1': 24 },
    });
    p.receive(WITH_PLAN);
    expect(p.savedList.at(-1)).toMatchObject({
      tab: 'ideas',
      openPhases: { '/ws/agent_plans/a': ['phase-1'] },
      filters: { plans: { q: 'x', groups: ['owner'] } },
      view: 'status',
      pages: { 'phase-1': 24 },
    });
  });
});

describe('task detail', () => {
  const PID = '/ws/agent_plans/a';
  const task = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    title: `Title ${id}`,
    file: `phase-0/${id}.md`,
    group: 'available',
    type: 'code',
    track: 'panel',
    tier: 'mid',
    repos: [],
    blockedBy: [],
    waitingOn: [],
    unblocks: [],
    pendingUnblocks: 0,
    started: null,
    finished: null,
    nextStep: null,
    phase: 'phase-0',
    depth: 0,
    duration: null,
    ...extra,
  });
  const phase = (dir: string, tasks: ReturnType<typeof task>[]) => ({
    title: dir,
    dir,
    done: 0,
    total: tasks.length,
    pct: 0,
    inProgress: 0,
    counts: {},
    abandoned: false,
    tasks,
  });
  const tasks = [task('F8-06', { unblocks: ['F8-08'] }), task('F8-08', { group: 'blocked', blockedBy: ['F8-06'], waitingOn: ['F8-06'] })];
  const STATUS_WITH_TASKS = {
    type: 'status',
    updated: '10:42',
    plans: [{ id: PID, name: 'a', pct: 0, done: 0, total: 2, phases: [phase('phase-0', tasks)], tasks, parallel: [] }],
  };
  const ROW = { action: 'detail', plan: PID, id: 'F8-06' };
  /** The panel with the card and the phase open, so the rows are drawn. */
  const mountDetail = () => mountPanel({ expanded: [PID], last: STATUS_WITH_TASKS, openPhases: { [PID]: ['phase-0'] } });
  const dialog = (p: MountedPanel) => view(p).queryByRole<HTMLDialogElement>('dialog');
  /** Opens the detail from its row, as the user does: focus on the row, then the click. */
  const open = (p: MountedPanel, data = ROW) => {
    const row = p.control(data);
    row.focus();
    p.click(row);
    return dialog(p) as HTMLDialogElement;
  };

  it('clickOf translates «go» (the row of another task) and the abandoned chip', () => {
    expect(clickOf({ action: 'go', plan: 'p', id: 'F1-01' })).toEqual({ type: 'go', plan: 'p', id: 'F1-01' });
    expect(clickOf({ action: 'go', plan: 'p' })).toBeUndefined();
    expect(clickOf({ action: 'chip', group: 'abandoned' })).toEqual({ type: 'chip', group: 'abandoned' });
    expect(readSaved({ filters: { plans: { groups: ['abandoned'] } } }).filters.plans.groups).toEqual(['abandoned']);
  });

  it('«go» on a cancelled task opens the phase of its replacement and moves focus to its row', () => {
    const old = task('F8-06', { group: 'cancelled', replacement: 'F9-01' });
    const replacement = task('F9-01', { phase: 'phase-1', file: 'phase-1/F9-01.md' });
    const status = {
      ...STATUS_WITH_TASKS,
      plans: [
        {
          ...STATUS_WITH_TASKS.plans[0],
          tasks: [old, replacement],
          phases: [phase('phase-0', [old]), phase('phase-1', [replacement])],
        },
      ],
    };
    const p = mountPanel({ expanded: [PID], last: status, openPhases: { [PID]: ['phase-0'] } });
    expect(p.has({ action: 'detail', plan: PID, id: 'F9-01' })).toBe(false);
    p.click({ action: 'go', plan: PID, id: 'F9-01' });
    expect(p.savedList.at(-1)?.openPhases[PID]).toContain('phase-1');
    expect(document.activeElement).toBe(p.control({ action: 'detail', plan: PID, id: 'F9-01' }));
    expect(document.activeElement?.getAttribute('tabindex')).toBe('0');
  });

  it('«go» to a task the filters hide opens it in the detail instead', () => {
    const old = task('F8-06', { group: 'cancelled', replacement: 'F9-01' });
    const replacement = task('F9-01', { phase: 'phase-1', file: 'phase-1/F9-01.md' });
    const status = {
      ...STATUS_WITH_TASKS,
      plans: [
        {
          ...STATUS_WITH_TASKS.plans[0],
          tasks: [old, replacement],
          phases: [phase('phase-0', [old]), phase('phase-1', [replacement])],
        },
      ],
    };
    const p = mountPanel({ expanded: [PID], last: status, filters: { plans: { q: 'F8', groups: [], track: '', tier: '' } } });
    p.click({ action: 'go', plan: PID, id: 'F9-01' });
    expect(view(p).getByRole('dialog', { name: 'Title F9-01' })).toBeTruthy();
  });

  it('Tab and Shift+Tab stay inside the open detail, wrapping at its first and last buttons', () => {
    const p = mountDetail();
    const popup = open(p);
    const buttons = within(popup).getAllByRole('button');
    const [first, last] = [buttons[0] as HTMLElement, buttons.at(-1) as HTMLElement];
    last.focus();
    expect(p.key('Tab')).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(p.key('Tab', { shiftKey: true })).toBe(true);
    expect(document.activeElement).toBe(last);
    // In the middle, the browser moves focus on its own.
    (buttons[1] as HTMLElement).focus();
    expect(p.key('Tab')).toBe(false);
  });

  it('clickOf translates detail, close and copy with an id', () => {
    expect(clickOf({ action: 'detail', plan: 'p', id: 'F1-01' })).toEqual({ type: 'detail', plan: 'p', id: 'F1-01' });
    expect(clickOf({ action: 'close' })).toEqual({ type: 'close' });
    expect(clickOf({ action: 'copy', plan: 'p', id: 'F1-01' })).toEqual({ type: 'copy', plan: 'p', id: 'F1-01' });
    expect(clickOf({ action: 'detail', plan: 'p' })).toBeUndefined();
  });

  it('opening draws the popup and opens it as a modal; going to F8-08 through the dependencies switches the task; Esc closes and focus returns to F8-06', () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    const p = mountDetail();
    expect(dialog(p)).toBeNull();
    const first = open(p);
    expect(view(p).getByRole('dialog', { name: 'Title F8-06' })).toBe(first);
    expect(first.open).toBe(true);
    // Opened by `showModal`, which traps focus and makes the rest inert (not a bare `open` attribute).
    expect(showModal.mock.contexts).toEqual([first]);
    p.click(p.control({ action: 'detail', plan: PID, id: 'F8-08' }, first));
    const second = view(p).getByRole<HTMLDialogElement>('dialog', { name: 'Title F8-08' });
    expect(showModal.mock.contexts).toEqual([first, second]);
    // The browser moves focus to the first control of the modal (happy-dom does not): Escape comes from there.
    expect(p.key('Escape', {}, within(second).getAllByRole('button')[0])).toBe(true);
    expect(dialog(p)).toBeNull();
    expect(document.activeElement).toBe(p.control(ROW));
  });

  it('the close button and a click on the backdrop close it and return focus to the origin row', () => {
    const p = mountDetail();
    const first = open(p);
    p.click(within(first).getByRole('button', { name: 'Fechar' }));
    expect(dialog(p)).toBeNull();
    expect(document.activeElement).toBe(p.control(ROW));
    // A click inside the box of the popup (here, on its edge) does not close it.
    const second = open(p);
    second.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 }));
    expect(dialog(p)).toBe(second);
    // The backdrop: the target is the <dialog> itself, outside its box.
    second.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 500, clientY: 500 }));
    expect(dialog(p)).toBeNull();
    expect(document.activeElement).toBe(p.control(ROW));
  });

  it('the open detail does not go into Saved', () => {
    const p = mountDetail();
    open(p);
    // Opening saves nothing; the next save (a new read, with the popup still open) does not carry it either.
    expect(p.savedList).toEqual([]);
    p.receive({ ...STATUS_WITH_TASKS, updated: '10:43' });
    expect(dialog(p)).not.toBeNull();
    expect(p.savedList).toHaveLength(1);
    expect(JSON.stringify(p.savedList.at(-1))).not.toContain('detail');
    expect(Object.keys(p.savedList.at(-1) ?? {})).not.toContain('detail');
  });

  it('Execute and Open file go to the host and take the popup out of the way; Copy command sends the id and leaves it open', () => {
    const p = mountDetail();
    let popup = open(p);
    p.click(p.control({ action: 'copy', plan: PID, id: 'F8-06' }, popup));
    expect(p.sent.at(-1)).toEqual({ type: 'copy', plan: PID, id: 'F8-06' });
    expect(dialog(p)).not.toBeNull();
    p.click(p.control({ action: 'execute', plan: PID, id: 'F8-06' }, dialog(p) as HTMLElement));
    expect(p.sent.at(-1)).toEqual({ type: 'execute', plan: PID, id: 'F8-06' });
    expect(dialog(p)).toBeNull();
    // Focus stays with whatever the action opens: not back on the row.
    expect(document.activeElement).not.toBe(p.control(ROW));
    popup = open(p);
    p.click(p.control({ action: 'open', plan: PID, file: 'phase-0/F8-06.md' }, popup));
    expect(p.sent.at(-1)).toEqual({ type: 'open', plan: PID, file: 'phase-0/F8-06.md' });
    expect(dialog(p)).toBeNull();
    expect(document.activeElement).not.toBe(p.control(ROW));
  });

  it('a new read that takes the task out of the plan closes the detail', () => {
    const p = mountDetail();
    open(p);
    p.receive({ ...STATUS_WITH_TASKS, plans: [{ ...STATUS_WITH_TASKS.plans[0], tasks: [task('F8-08')] }] });
    expect(dialog(p)).toBeNull();
    p.receive(STATUS_WITH_TASKS);
    open(p, { action: 'detail', plan: PID, id: 'F8-08' });
    p.receive(STATUS_WITH_TASKS);
    expect(view(p).getByRole('dialog', { name: 'Title F8-08' })).toBeTruthy();
  });
});

describe('search, filters and by-status view', () => {
  const ID = '/ws/agent_plans/a';
  const task = (id: string, group: string, phase: string, track = 'panel', tier = 'mid') => ({
    ...TASK_VIEW,
    id,
    title: `Titulo ${id}`,
    file: `${phase}/${id}.md`,
    group,
    type: 'code',
    track,
    tier,
    repos: [],
    depth: 0,
    waitingOn: [],
    nextStep: null,
  });
  const phase = (dir: string, tasks: ReturnType<typeof task>[]) => ({
    title: dir,
    dir,
    done: 0,
    total: tasks.length,
    pct: 0,
    inProgress: 0,
    counts: {},
    abandoned: false,
    tasks,
  });
  const t8 = [task('F8-01', 'available', 'p8'), task('F8-02', 'draft', 'p8', 'ci')];
  const t1 = [task('F1-01', 'done', 'p1', 'panel', 'senior')];
  const WITH_TASKS = {
    ...STATUS,
    plans: [
      { id: ID, name: 'a', pct: 0, done: 0, total: 3, tasks: [...t1, ...t8], parallel: [], phases: [phase('p1', t1), phase('p8', t8)] },
    ],
  };
  const built = (extra: Record<string, unknown> = {}) => mountPanel({ expanded: [ID], last: WITH_TASKS, ...extra });
  /** The text of the active tab panel; «Now» also lists available tasks. */
  const panelText = (p: MountedPanel) => view(p).getByRole('tabpanel').textContent ?? '';
  const search = (p: MountedPanel) => p.control({ field: 'q' }) as HTMLInputElement;
  /** Types in the search and lets the pause after the last key pass. */
  const typeSearch = (p: MountedPanel, value: string) => {
    p.type('q', value);
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('typing 10 characters draws and saves once, after the pause; until then the field is the same element', () => {
    const p = built();
    const draws = vi.spyOn(Element.prototype, 'innerHTML', 'set');
    // The panel draws into this child of the root; the live region beside it is never redrawn.
    const content = p.root.querySelector('.content');
    expect(content).not.toBeNull();
    const field = search(p);
    for (const value of ['p', 'pa', 'pai', 'pain', 'paine', 'painel', 'painel ', 'painel d', 'painel do', 'painel doi']) {
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    vi.advanceTimersByTime(SEARCH_DELAY_MS - 1);
    expect(draws.mock.contexts.filter((c) => c === content)).toHaveLength(0);
    expect(p.savedList).toEqual([]);
    expect(search(p)).toBe(field);
    vi.advanceTimersByTime(1);
    expect(draws.mock.contexts.filter((c) => c === content)).toHaveLength(1);
    expect(p.savedList.map((s) => s.filters.plans.q)).toEqual(['painel doi']);
  });

  it('a click before the pause draws the search with it, and the pending draw does not come again', () => {
    const p = built();
    p.type('q', 'F8');
    p.click({ action: 'chip', group: 'draft' });
    expect(p.savedList.at(-1)).toMatchObject({ filters: { plans: { q: 'F8', groups: ['draft'] } } });
    const saves = p.savedList.length;
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    expect(p.savedList).toHaveLength(saves);
  });

  it('clickOf translates chip, view, clear and group, and refuses the incomplete', () => {
    expect(clickOf({ action: 'chip', group: 'draft' })).toEqual({ type: 'chip', group: 'draft' });
    expect(clickOf({ action: 'chip', group: 'xis' })).toBeUndefined();
    expect(clickOf({ action: 'view', view: 'status' })).toEqual({ type: 'view', view: 'status' });
    expect(clickOf({ action: 'view', view: 'other' })).toBeUndefined();
    expect(clickOf({ action: 'clear' })).toEqual({ type: 'clear' });
    expect(clickOf({ action: 'group', plan: 'p', group: 'done' })).toEqual({ type: 'group', plan: 'p', group: 'done' });
    expect(clickOf({ action: 'group', group: 'done' })).toBeUndefined();
  });

  it('typing filters after the pause, highlights the term, opens only the phase with a result and saves in filters', () => {
    const p = built();
    typeSearch(p, 'F8');
    expect([...p.root.querySelectorAll('mark')].map((m) => m.textContent)).toContain('F8');
    expect(p.has({ action: 'phase', plan: ID, phase: 'p8' })).toBe(true);
    expect(p.has({ action: 'phase', plan: ID, phase: 'p1' })).toBe(false);
    expect(search(p).value).toBe('F8');
    expect(p.savedList.at(-1)?.filters.plans.q).toBe('F8');
  });

  it('the redraw after typing keeps focus and the cursor in the search field', () => {
    const p = built();
    search(p).focus();
    search(p).value = 'F8';
    search(p).setSelectionRange(1, 1);
    search(p).dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    const field = search(p);
    expect(document.activeElement).toBe(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([1, 1]);
  });

  it('the status chip turns on and off, and «limpar» returns to the earlier state', () => {
    const p = built();
    const before = p.root.innerHTML;
    p.click({ action: 'chip', group: 'draft' });
    expect(panelText(p)).toContain('F8-02');
    expect(panelText(p)).not.toContain('F8-01');
    expect(p.savedList.at(-1)?.filters.plans.groups).toEqual(['draft']);
    typeSearch(p, 'F8');
    p.click({ action: 'clear' });
    expect(p.savedList.at(-1)?.filters.plans).toEqual({ q: '', groups: [], track: '', tier: '' });
    expect(p.root.innerHTML).toBe(before);
    expect(document.activeElement).toBe(search(p));
  });

  it('track and tier come from the selector (change)', () => {
    const p = built({ advanced: true });
    p.type('track', 'ci', 'change');
    expect(panelText(p)).toContain('F8-02');
    expect(panelText(p)).not.toContain('F8-01');
    p.type('tier', 'senior', 'change');
    expect(p.root.querySelector('.no-result')).not.toBeNull();
  });

  it('a field that is not in the bar is ignored', () => {
    const p = built();
    const before = p.savedList.length;
    const other = document.createElement('input');
    other.dataset['field'] = 'other';
    p.root.append(other);
    other.dispatchEvent(new Event('input', { bubbles: true }));
    expect(p.savedList.length).toBe(before);
  });

  it('the by-status view and the open groups are saved; done ones start collapsed', () => {
    const p = built({ advanced: true });
    p.click(view(p).getByRole('button', { name: 'Por estado' }));
    expect(p.savedList.at(-1)?.view).toBe('status');
    expect(view(p).getByRole('button', { name: 'Por estado' }).getAttribute('aria-pressed')).toBe('true');
    expect(expanded(p, { action: 'group', group: 'available' })).toBe('true');
    expect(expanded(p, { action: 'group', group: 'done' })).toBe('false');
    p.click({ action: 'group', plan: ID, group: 'done' });
    expect(expanded(p, { action: 'group', group: 'done' })).toBe('true');
    expect(p.savedList.at(-1)?.openPhases[`${ID}\u0000status`]).toContain('done');
    // A new load does not take away the open groups (the key has the plan before the \0).
    p.receive(WITH_TASKS);
    expect(p.savedList.at(-1)?.openPhases[`${ID}\u0000status`]).toContain('done');
  });

  it('clickOf translates the Now section and refuses the incomplete', () => {
    expect(clickOf({ action: 'now-section', plan: 'p', group: 'owner' })).toEqual({ type: 'nowSection', plan: 'p', group: 'owner' });
    expect(clickOf({ action: 'now-section', group: 'owner' })).toBeUndefined();
    expect(clickOf({ action: 'now-section', plan: 'p', group: 'xis' })).toBeUndefined();
  });

  it('in Now the sections open by default, close on click and Saved remembers', () => {
    const p = built({ tab: 'now' });
    const available = { action: 'now-section', plan: ID, group: 'available' };
    expect(expanded(p, available)).toBe('true');
    p.click(available);
    expect(expanded(p, available)).toBe('false');
    expect(p.savedList.at(-1)?.openPhases[`${ID}\u0000now`]).not.toContain('available');
    // The Plans by-status view does not change with that.
    expect(p.savedList.at(-1)?.openPhases[`${ID}\u0000status`]).toBeUndefined();
    p.click(available);
    expect(expanded(p, available)).toBe('true');
  });

  it('«mostrar mais» in a Now section adds another page', () => {
    const many = Array.from({ length: 10 }, (_, i) => task(`F9-0${i}`, 'available', 'p9'));
    const last = {
      ...STATUS,
      plans: [{ id: ID, name: 'a', pct: 0, done: 0, total: 10, tasks: many, parallel: [], phases: [phase('p9', many)] }],
    };
    const p = mountPanel({ expanded: [], last, tab: 'now' });
    expect(panelText(p)).not.toContain('F9-09');
    p.click({ action: 'more', plan: ID, phase: 'now:available' });
    expect(panelText(p)).toContain('F9-09');
    expect(p.has({ action: 'more' })).toBe(false);
  });

  it('the saved state comes back: search, filters and view already on the first draw', () => {
    const p = built({ filters: { q: 'f8', groups: [], track: '', tier: '' }, view: 'status' });
    expect([...p.root.querySelectorAll('mark')].map((m) => m.textContent)).toContain('F8');
    expect(p.has({ action: 'group', group: 'available' })).toBe(true);
  });

  const IDEAS = {
    items: [
      { id: 'painel-novo.md', title: 'Painel novo', status: 'open', questions: 0 },
      { id: 'outra.md', title: 'Outra coisa', status: 'mapped', questions: null, plan: 'p' },
    ],
    actions: [],
  };
  const WITH_IDEAS = { ...WITH_TASKS, ideas: IDEAS };

  it('the «filter» message and ⌘F focus the active tab search, without switching tabs', () => {
    const p = mountPanel({ expanded: [ID], last: WITH_IDEAS, tab: 'ideas' });
    p.receive({ type: 'filter' });
    expect(document.activeElement).toBe(search(p));
    expect(view(p).getByRole('tabpanel', { name: /Ideias/ })).toBeTruthy();
    p.click({ action: 'tab', tab: 'now' });
    expect(p.key('f', { metaKey: true }, document.body)).toBe(true);
    expect(document.activeElement).toBe(search(p));
    expect(view(p).getByRole('tabpanel', { name: /Agora/ })).toBeTruthy();
    expect(p.savedList.at(-1)?.tab).toBe('now');
  });

  it('the Ideas sections open and close through Saved (Mapped closed by default) and survive a new read', () => {
    const p = mountPanel({ expanded: [], last: WITH_IDEAS, tab: 'ideas' });
    const section = (status: string) => ({ action: 'ideas-section', status });
    expect(expanded(p, section('mapped'))).toBe('false');
    p.click(section('mapped'));
    expect(expanded(p, section('mapped'))).toBe('true');
    p.click(section('open'));
    expect(expanded(p, section('open'))).toBe('false');
    p.receive(WITH_IDEAS);
    expect(expanded(p, section('mapped'))).toBe('true');
    const opened = p.savedList.at(-1)?.openPhases['\u0000ideas'];
    expect([...(opened ?? [])].sort()).toEqual(['invalid', 'mapped', 'ready', 'refining']);
  });

  it('the link of the mapped idea plan selects Plans, opens that plan card and focuses it', () => {
    const withLink = { ...WITH_IDEAS, ideas: { ...IDEAS, items: [{ ...IDEAS.items[1], plan: 'agent_plans/a/' }] } };
    const p = mountPanel({ expanded: [], last: withLink, tab: 'ideas', openPhases: { '\u0000ideas': ['mapped'] } });
    p.click({ action: 'idea-plan', plan: 'agent_plans/a/' });
    expect(p.savedList.at(-1)?.tab).toBe('plans');
    expect(p.savedList.at(-1)?.expanded).toEqual([ID]);
    expect(p.sent.at(-1)).toEqual({ type: 'tab', tab: 'plans' });
    expect(document.activeElement).toBe(p.control({ action: 'toggle', plan: ID }));
  });

  it('each tab keeps its own search and its own chips; switching tabs keeps each one filter', () => {
    const p = mountPanel({ expanded: [ID], last: WITH_IDEAS, tab: 'ideas' });
    typeSearch(p, 'painel');
    expect([...p.root.querySelectorAll('mark')].map((m) => m.textContent)).toContain('Painel');
    p.click({ action: 'chip', status: 'open' });
    expect(p.savedList.at(-1)?.filters.ideas).toEqual({ q: 'painel', states: ['open'] });
    p.click({ action: 'tab', tab: 'now' });
    expect(search(p).value).toBe('');
    typeSearch(p, 'F8');
    p.click({ action: 'chip', group: 'available' });
    p.click({ action: 'tab', tab: 'plans' });
    expect(search(p).value).toBe('');
    p.click({ action: 'tab', tab: 'ideas' });
    expect(search(p).value).toBe('painel');
    expect(p.savedList.at(-1)?.filters).toEqual({
      now: { q: 'F8', groups: ['available'], plan: '' },
      plans: { q: '', groups: [], track: '', tier: '' },
      ideas: { q: 'painel', states: ['open'] },
    });
    // «Limpar» clears only the active tab.
    p.click({ action: 'clear' });
    expect(p.savedList.at(-1)?.filters.ideas).toEqual({ q: '', states: [] });
    expect(p.savedList.at(-1)?.filters.now.q).toBe('F8');
  });

  it('the Now plan selector goes to the Now filters', () => {
    const second = { ...WITH_TASKS.plans[0], id: '/ws/agent_plans/b', name: 'b' };
    const p = mountPanel({ expanded: [], last: { ...WITH_TASKS, plans: [...WITH_TASKS.plans, second] }, tab: 'now', advanced: true });
    p.type('plan', ID, 'change');
    expect(p.savedList.at(-1)?.filters.now.plan).toBe(ID);
  });

  it('the funnel opens and closes the advanced part, which is saved and closes when the tab changes', () => {
    const p = built();
    expect(p.has({ field: 'track' })).toBe(false);
    p.click(view(p).getByRole('button', { name: 'Mais filtros' }));
    expect(p.savedList.at(-1)?.advanced).toBe(true);
    expect(p.has({ field: 'track' })).toBe(true);
    p.click({ action: 'tab', tab: 'ideas' });
    expect(p.savedList.at(-1)?.advanced).toBe(false);
  });

  it('clickOf translates the idea chip and the funnel', () => {
    expect(clickOf({ action: 'chip', status: 'ready' })).toEqual({ type: 'ideaChip', status: 'ready' });
    expect(clickOf({ action: 'chip', status: 'xis' })).toBeUndefined();
    expect(clickOf({ action: 'advanced' })).toEqual({ type: 'advanced' });
  });

  it('the «collapseAll» message also selects the Plans tab, where the effect shows', () => {
    const p = built({ tab: 'now' });
    p.receive({ type: 'collapseAll' });
    expect(p.savedList.at(-1)?.tab).toBe('plans');
    expect(view(p).getByRole('tab', { selected: true }).dataset['tab']).toBe('plans');
  });

  it('the tab row height goes to --pr-tabs-height on every draw and on resize', () => {
    const { box } = fakeLayout();
    const p = built();
    expect(p.root.style.getPropertyValue('--pr-tabs-height')).toBe('0px');
    box.tabsHeight = 30;
    window.dispatchEvent(new Event('resize'));
    expect(p.root.style.getPropertyValue('--pr-tabs-height')).toBe('30px');
  });

  it('the filter bar height goes to --pr-filters-height on every draw and when the view changes width', () => {
    const { box } = fakeLayout();
    const p = built();
    // Drawn on bind (there was a saved state): the variable already exists, with the bar measure.
    expect(p.root.style.getPropertyValue('--pr-filters-height')).toBe('0px');
    box.filtersHeight = 58;
    typeSearch(p, 'f8');
    expect(p.root.style.getPropertyValue('--pr-filters-height')).toBe('58px');
    // Narrowing the view breaks the chips into more rows: the page measures again, without redrawing.
    box.filtersHeight = 84;
    const html = p.root.innerHTML;
    window.dispatchEvent(new Event('resize'));
    expect(p.root.style.getPropertyValue('--pr-filters-height')).toBe('84px');
    expect(p.root.innerHTML).toBe(html);
  });

  it('the chips that do not fit on the row get .overflows, on every draw and on resize', () => {
    const { box } = fakeLayout();
    const p = built();
    const chips = () => p.root.querySelector('.chips') as HTMLElement;
    expect(chips().classList.contains('overflows')).toBe(false);
    box.chipsScroll = 600;
    box.chipsClient = 400;
    window.dispatchEvent(new Event('resize'));
    expect(chips().classList.contains('overflows')).toBe(true);
    box.chipsClient = 700;
    typeSearch(p, 'f');
    expect(chips().classList.contains('overflows')).toBe(false);
  });

  it('the focused chip asks to be fully in view on the row; what is not a chip, does not', () => {
    const p = built();
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    const chip = p.control({ action: 'chip', group: 'draft' });
    chip.focus();
    expect(scroll.mock.contexts).toEqual([chip]);
    expect(scroll.mock.calls).toEqual([[{ inline: 'nearest', block: 'nearest' }]]);
    search(p).focus();
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('without a filter bar (no plan), the variable is 0px', () => {
    const p = mountPanel();
    p.receive(STATUS);
    expect(p.root.style.getPropertyValue('--pr-filters-height')).toBe('0px');
  });
});

describe('tree by keyboard', () => {
  const ID = '/ws/agent_plans/a';
  const task = (id: string, dir: string) => ({
    ...TASK_VIEW,
    id,
    title: id,
    file: `${dir}/${id}.md`,
    group: 'available',
    tier: 'mid',
    depth: 0,
    waitingOn: [],
    nextStep: null,
  });
  const phase = (dir: string, tasks: ReturnType<typeof task>[]) => ({
    title: dir,
    dir,
    done: 0,
    total: tasks.length,
    pct: 0,
    inProgress: 0,
    counts: {},
    abandoned: false,
    tasks,
  });
  const first = [task('F1-01', 'p1'), task('F1-02', 'p1')];
  const second = [task('F2-01', 'p2')];
  const last = {
    ...STATUS,
    plans: [{ ...PLAN, total: 3, tasks: [...first, ...second], phases: [phase('p1', first), phase('p2', second)] }],
  };
  /** The tree with p1 open (two tasks) and p2 closed: the items in order are p1, F1-01, F1-02, p2. */
  const mountTree = () => mountPanel({ expanded: [ID], last, openPhases: { [ID]: ['p1'] } });
  const P1 = { action: 'phase', plan: ID, phase: 'p1' };
  const P2 = { action: 'phase', plan: ID, phase: 'p2' };
  const T1 = { action: 'detail', plan: ID, id: 'F1-01' };
  const T2 = { action: 'detail', plan: ID, id: 'F1-02' };
  /** A key on the item with these `data-*`, with focus on it as the browser would have. */
  const press = (p: MountedPanel, data: Record<string, string>, key: string, init: KeyboardEventInit = {}) => {
    const el = p.control(data);
    el.focus();
    return p.key(key, init, el);
  };

  it('the tree has the phases at level 1 and the tasks of the open phase at level 2', () => {
    const p = mountTree();
    const items = view(p).getAllByRole('treeitem');
    expect(items.map((i) => i.dataset['phase'] ?? i.dataset['id'])).toEqual(['p1', 'F1-01', 'F1-02', 'p2']);
    expect(items.map((i) => i.getAttribute('aria-level'))).toEqual(['1', '2', '2', '1']);
  });

  it('down and up walk the visible items, without leaving the ends, and move tabindex 0', () => {
    const p = mountTree();
    expect(press(p, P1, 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(p.control(T1));
    expect(p.control(T1).getAttribute('tabindex')).toBe('0');
    p.key('ArrowDown');
    expect(document.activeElement).toBe(p.control(T2));
    expect(p.control(T1).getAttribute('tabindex')).toBe('-1');
    p.key('ArrowUp');
    expect(document.activeElement).toBe(p.control(T1));
    p.key('ArrowUp');
    p.key('ArrowUp');
    expect(document.activeElement).toBe(p.control(P1));
    expect(
      view(p)
        .getAllByRole('treeitem')
        .filter((i) => i.getAttribute('tabindex') === '0'),
    ).toEqual([p.control(P1)]);
  });

  it('the focused item that falls under the pinned plan strip scrolls to just below it; in view, it does not scroll', () => {
    const { box, scrolls } = fakeLayout();
    const p = mountTree();
    // The name strip pinned with its base at 90 px; F1-01 starts at 40, behind it.
    box.band = 90;
    box.top.set('F1-01', 40);
    press(p, T2, 'ArrowUp');
    expect(document.activeElement).toBe(p.control(T1));
    expect(scrolls()).toEqual([-50]);
    // Below the strip, the browser already showed it: nothing to scroll.
    box.top.set('F1-01', 90);
    press(p, T2, 'ArrowUp');
    expect(scrolls()).toEqual([-50]);
  });

  it('the filter bar also covers: the lowest base between it and the strip applies', () => {
    const { box, scrolls } = fakeLayout();
    const p = mountTree();
    box.filtersBottom = 120;
    box.top.set('F1-01', 100);
    press(p, T2, 'ArrowUp');
    expect(scrolls()).toEqual([-20]);
  });

  it('the pinned tab row also covers, even with no bar or strip below it', () => {
    const { box, scrolls } = fakeLayout();
    const p = mountTree();
    box.tabsBottom = 140;
    box.top.set('F1-01', 100);
    press(p, T2, 'ArrowUp');
    expect(scrolls()).toEqual([-40]);
  });

  it('Home and End go to the first and the last item', () => {
    const p = mountTree();
    press(p, T1, 'End');
    expect(document.activeElement).toBe(p.control(P2));
    press(p, T1, 'Home');
    expect(document.activeElement).toBe(p.control(P1));
  });

  it('right: a closed phase opens; an open phase enters the first task; a task does nothing', () => {
    const p = mountTree();
    press(p, P2, 'ArrowRight');
    expect(expanded(p, P2)).toBe('true');
    // The redraw returns focus to the same phase.
    expect(document.activeElement).toBe(p.control(P2));
    press(p, P1, 'ArrowRight');
    expect(expanded(p, P1)).toBe('true');
    expect(document.activeElement).toBe(p.control(T1));
    expect(press(p, T1, 'ArrowRight')).toBe(false);
  });

  it('left: an open phase closes; a task goes up to the phase; a closed phase does nothing', () => {
    const p = mountTree();
    press(p, T2, 'ArrowLeft');
    expect(document.activeElement).toBe(p.control(P1));
    press(p, P1, 'ArrowLeft');
    expect(expanded(p, P1)).toBe('false');
    expect(document.activeElement).toBe(p.control(P1));
    expect(press(p, P2, 'ArrowLeft')).toBe(true);
    expect(expanded(p, P2)).toBe('false');
  });

  it('a key outside the tree or with a modifier passes', () => {
    const p = mountTree();
    expect(p.key('ArrowDown', {}, p.root)).toBe(false);
    expect(press(p, T1, 'ArrowDown', { ctrlKey: true })).toBe(false);
    expect(document.activeElement).toBe(p.control(T1));
  });

  it('the item selector helper quotes what it is given', () => {
    expect(byData({ action: 'detail', plan: 'a"b', nowSection: 'x' })).toBe(
      '[data-action="detail"][data-plan="a\\"b"][data-now-section="x"]',
    );
  });
});

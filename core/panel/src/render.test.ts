// @vitest-environment happy-dom
import type { PhaseView, TaskView, PlanView } from './view';
import { within } from '@testing-library/dom';
import { attributeOf, elementOf, hasElement, parseHtml, textOf } from './testing/panel-dom';
import { pathToTask, pageKey, nowKey, taskDetail, escapeHtml, openPhasesByDefault, render as renderIn } from './render';
import type { RenderInput } from './render';
import ptBR from '@plan-relay/i18n/pt-BR.json';
import { createStrings, stringsFor } from '@plan-relay/i18n';
import { badgeLabel, CARD_BADGES } from './badge';
import { planView as planViewIn } from './view';
import { largePlan } from './testing/large-plan';

// The expectations are in pt-BR: render and planView without strings of their own get the pt-BR ones (the code falls back to English).
const PT = stringsFor('pt-BR');
const render = (input: RenderInput): string => renderIn({ ...input, strings: input.strings ?? PT });
const planView = (...a: Parameters<typeof planViewIn>) => planViewIn(a[0], a[1], a[2] ?? PT);

/** A filter chip of `html` as `[class, aria-pressed, label, count]`. */
function chipOf(html: string, selector: string): [string, string | null, string, string] {
  const el = elementOf(html, selector);
  return [el.className, el.getAttribute('aria-pressed'), el.firstChild?.textContent ?? '', el.querySelector('.n')?.textContent ?? ''];
}

/** A phase of the card, with the given tasks; count and progress come from them. */
function phase(f: Pick<PhaseView, 'title' | 'done' | 'total' | 'pct'> & Partial<PhaseView>): PhaseView {
  const tasks = f.tasks ?? [];
  const counts: PhaseView['counts'] = {};
  for (const t of tasks) counts[t.group] = (counts[t.group] ?? 0) + 1;
  return { dir: 'phase-0', inProgress: counts['in-progress'] ?? 0, abandoned: false, counts, ...f, tasks };
}

/** A task of the plan view; only what the drawing reads. */
function taskView(id: string, group: TaskView['group'], over: Partial<TaskView> = {}): TaskView {
  return {
    id,
    title: id,
    file: `phase-0/${id}.md`,
    group,
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
    ...over,
  };
}

function plan(over: Partial<PlanView> = {}): PlanView {
  const running = taskView('F0-02', 'in-progress', { title: 'Coisa', nextStep: 'testar' });
  return {
    id: '/ws/agent_plans/a',
    name: 'a',
    badge: 'in-progress',
    pct: 40,
    done: 2,
    total: 5,
    phases: [phase({ title: 'Fase 0', done: 2, total: 5, pct: 40, tasks: [running] })],
    tasks: [],
    parallel: [],
    ...over,
  };
}

/** A plan that failed to read: an error and no badge. */
function errorPlan(error: string): PlanView {
  const { badge: _badge, ...rest } = plan();
  return { ...rest, error, phases: [] };
}

describe('escapeHtml', () => {
  it('escapes the five HTML characters', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
});

describe('render', () => {
  it('takes one named input; what is left out gets its default', () => {
    const html = render({ plans: [plan()], updated: '10:42', expanded: new Set(['/ws/agent_plans/a']) });
    expect(attributeOf(html, 'button[role="tab"][data-tab="plans"]', 'aria-selected')).toBe('true');
    expect(html).toContain('F0-02');
    const empty = render({ plans: [], updated: '10:42', tab: 'now' });
    expect(attributeOf(empty, 'button[role="tab"][data-tab="now"]', 'aria-selected')).toBe('true');
    expect(empty).not.toContain('dialog');
  });

  it('the phase is an aria-expanded button; a phase with an in-progress task opens by default and brings the tasks', () => {
    const html = render({ plans: [plan()], updated: '10:42', expanded: new Set(['/ws/agent_plans/a']) });
    expect(attributeOf(html, 'button.sec-head[data-action="phase"][data-phase="phase-0"]', 'aria-expanded')).toBe('true');
    expect(textOf(html, 'span.sec-title[title="Fase 0"]')).toBe('Fase 0');
    expect(html).toContain('F0-02');
    expect(html).toContain('testar');
    expect(html).toContain('data-file="phase-0/F0-02.md"');
  });

  it('the phase ring and counters: a counter only for the statuses present, done/total at the end', () => {
    const tasks = [taskView('F0-01', 'done'), taskView('F0-02', 'in-progress'), taskView('F0-03', 'available'), taskView('F0-04', 'draft')];
    const html = render({
      plans: [plan({ phases: [phase({ title: 'F', done: 1, total: 4, pct: 25, tasks })] })],
      updated: '10:42',
      expanded: new Set(['/ws/agent_plans/a']),
    });
    expect(html).toContain('class="sec-ic status-in-progress"');
    expect(textOf(html, 'span.b.status-in-progress[title="em andamento"]')).toBe('1');
    expect(textOf(html, 'span.b.status-available[title="livres"]')).toBe('1');
    expect(textOf(html, 'span.b.status-draft[title="rascunho"]')).toBe('1');
    expect(html).not.toContain('class="b status-done"');
    expect(html).toContain('<span class="sec-num">1/4</span>');
  });
});

describe('render — phases in an accordion', () => {
  const EXP = new Set(['/ws/agent_plans/a']);
  const ID = '/ws/agent_plans/a';
  const withPhases = (
    phases: PhaseView[],
    extra?: Partial<PlanView>,
    opened: Record<string, string[]> = {},
    pages: Record<string, number> = {},
  ) => render({ plans: [plan({ phases, ...extra })], updated: '10:42', expanded: EXP, openPhases: opened, pages });

  const f0 = phase({ title: 'Concluída', dir: 'p0', done: 1, total: 1, pct: 100, tasks: [taskView('F0-01', 'done')] });
  const f1 = phase({ title: 'Livre', dir: 'p1', done: 0, total: 1, pct: 0, tasks: [taskView('F1-01', 'available')] });
  const f2 = phase({ title: 'Dono', dir: 'p2', done: 0, total: 1, pct: 0, tasks: [taskView('F2-01', 'owner')] });

  it('with no in-progress task, the first phase with an available or owner task opens; the completed one goes to the closed block', () => {
    const html = withPhases([f0, f1, f2]);
    expect(html).not.toContain('data-phase="p0"');
    expect(attributeOf(html, '[data-phase="p1"][aria-expanded]', 'aria-expanded')).toBe('true');
    expect(attributeOf(html, '[data-phase="p2"][aria-expanded]', 'aria-expanded')).toBe('false');
    expect(attributeOf(html, '[data-phase="@done"][aria-expanded]', 'aria-expanded')).toBe('false');
  });

  it('the in-progress phases come first and the completed ones sit in the block, at the end, closed', () => {
    const html = withPhases([f0, f1, f2]);
    expect(html.indexOf('data-phase="p1"')).toBeLessThan(html.indexOf('data-phase="p2"'));
    expect(html.indexOf('data-phase="p2"')).toBeLessThan(html.indexOf('data-phase="@done"'));
    expect(html).toContain('class="sec done-block group-done"');
    expect(html).toContain('<span class="sec-title">Fases concluídas</span>');
    expect(html).toContain('<span class="sec-num pc status-done">1 tasks</span>');
    expect(html).not.toContain('Concluída');
  });

  it('the open block brings the completed phases without an icon', () => {
    const html = withPhases([f0, f1], {}, { [ID]: ['@done'] });
    expect(attributeOf(html, '[data-phase="@done"][aria-expanded]', 'aria-expanded')).toBe('true');
    expect(attributeOf(html, '[data-phase="p0"][aria-expanded]', 'aria-expanded')).toBe('false');
    const header = html.slice(
      html.lastIndexOf('<button', html.indexOf('data-phase="p0"')),
      html.indexOf('</button>', html.indexOf('data-phase="p0"')),
    );
    expect(header).not.toContain('sec-ic');
  });

  it('with a search or filter the block disappears and the phases with a result return, open', () => {
    const html = render({
      plans: [plan({ phases: [f0, f1], tasks: [...f0.tasks, ...f1.tasks] })],
      updated: '10:42',
      expanded: EXP,
      filters: {
        q: 'F0-01',
        groups: [],
        track: '',
        tier: '',
      },
    });
    expect(html).not.toContain('done-block');
    expect(attributeOf(html, '[data-phase="p0"][aria-expanded]', 'aria-expanded')).toBe('true');
  });

  it('a plan with no completed phase has no block', () => {
    expect(withPhases([f1, f2])).not.toContain('done-block');
  });

  it('a fully completed plan shows only the block, open', () => {
    const html = withPhases([f0], {}, { [ID]: openPhasesByDefault({ phases: [f0] }) });
    expect(attributeOf(html, '[data-phase="@done"][aria-expanded]', 'aria-expanded')).toBe('true');
    expect(attributeOf(html, '[data-phase="p0"][aria-expanded]', 'aria-expanded')).toBe('false');
  });

  it('a collapsed phase has no tasks in the HTML', () => {
    expect(withPhases([f0, f1], {}, { [ID]: ['@done'] })).not.toContain('F0-01');
    // The user opened the block and the phase: the completed tasks appear.
    expect(withPhases([f0, f1], {}, { [ID]: ['@done', 'p0'] })).toContain('F0-01');
  });

  it('the user choice beats the default: an empty list closes the phase that would open by itself', () => {
    const html = withPhases(
      [phase({ title: 'F', dir: 'p0', done: 0, total: 1, pct: 0, tasks: [taskView('F0-01', 'in-progress')] })],
      {},
      { [ID]: [] },
    );
    expect(attributeOf(html, '[data-phase="p0"][aria-expanded]', 'aria-expanded')).toBe('false');
    expect(html).not.toContain('F0-01');
  });

  it('8 tasks per page and «show more», a link, with what remains', () => {
    const tasks = Array.from({ length: 20 }, (_, i) => taskView(`F0-${String(i + 1).padStart(2, '0')}`, 'available'));
    const f = phase({ title: 'F', dir: 'p0', done: 0, total: 20, pct: 0, tasks });
    const html = withPhases([f]);
    expect(html.match(/<li class="ln /g)).toHaveLength(8);
    expect(html).toContain('F0-08');
    expect(html).not.toContain('F0-09');
    expect(textOf(html, 'button.more-link[data-action="more"][data-plan="/ws/agent_plans/a"][data-phase="p0"]')).toBe(
      'Mostrar mais 8 · faltam 12',
    );
    const second = withPhases([f], {}, {}, { [pageKey(ID, 'p0')]: 16 });
    expect(second.match(/<li class="ln /g)).toHaveLength(16);
    expect(second).toContain('Mostrar mais 4 · faltam 4');
    const allPages = withPhases([f], {}, {}, { [pageKey(ID, 'p0')]: 24 });
    expect(allPages.match(/<li class="ln /g)).toHaveLength(20);
    expect(allPages).not.toContain('data-action="more"');
  });

  it('the subtask carries the indentation class by depth', () => {
    const tasks = [
      taskView('F1-03', 'available'),
      taskView('F1-03.1', 'available', { depth: 1 }),
      taskView('F1-03.1.1', 'available', { depth: 2 }),
    ];
    const html = withPhases([phase({ title: 'F', dir: 'p0', done: 0, total: 3, pct: 0, tasks })]);
    const rowClass = (id: string): string | undefined =>
      elementOf(html, `li[role="none"] > button:first-child[data-id="${id}"]`).parentElement?.className;
    expect(rowClass('F1-03')).toBe('ln group-available');
    expect(rowClass('F1-03.1')).toBe('ln group-available child depth-1');
    expect(rowClass('F1-03.1.1')).toBe('ln group-available child depth-2');
  });

  it('the task body: status icon, ID and title (the tier goes to the tooltip); clicking opens the detail', () => {
    const t = taskView('F1-01', 'draft', { title: 'Rascunho', tier: 'senior' });
    const html = withPhases([phase({ title: 'F', dir: 'p0', done: 0, total: 1, pct: 0, tasks: [t] })], {}, { [ID]: ['p0'] });
    expect(html).toContain('class="ic ic-status status-draft"');
    expect(html).toContain('<span class="id">F1-01</span><span class="tt">Rascunho</span>');
    expect(html).toContain('title="Rascunho · Tier: senior"');
    const body = elementOf(html, '.ln-body[role="treeitem"][data-action="detail"][data-plan="/ws/agent_plans/a"][data-id="F1-01"]');
    expect(body.getAttribute('tabindex')).toBe('-1');
    expect(body.getAttribute('aria-level')).toBe('2');
    expect(body.getAttribute('aria-label')).toMatch(/^F1-01 — /);
  });

  it('an in-progress task shows how long it has been running and the next step', () => {
    const t = taskView('F1-05', 'in-progress', { duration: 125, nextStep: 'rodar' });
    const html = withPhases([phase({ title: 'F', dir: 'p0', done: 0, total: 1, pct: 0, tasks: [t] })], {}, { [ID]: ['p0'] });
    expect(html).toMatch(/<div class="sub"[^>]*>há 2 h 5 min · rodar<\/div>/);
  });

  it('the 540-task plan: opening phases and «show more» draw one page of rows per open phase, not the whole plan', () => {
    const v = planView({ folder: '/ws/agent_plans/grande', name: 'grande', status: largePlan() }, new Date('2026-11-14T12:00:00Z'));
    // The finished phases go to the block: the 8-task page is measured on a phase that did not finish.
    const opened = v.phases.find((f) => f.done !== f.total)!;
    const all = ['@done', ...v.phases.map((f) => f.dir)];
    const draw = (opened: string[], pages: Record<string, number> = {}) => {
      return render({ plans: [v], updated: '10:42', expanded: new Set([v.id]), openPhases: { [v.id]: opened }, pages });
    };
    const rows = (html: string) => html.match(/<li class="ln /g)?.length;
    expect(rows(draw([opened.dir]))).toBe(8);
    expect(rows(draw(all))).toBeLessThanOrEqual(8 * all.length);
    expect(rows(draw([opened.dir], { [pageKey(v.id, opened.dir)]: 16 }))).toBe(Math.min(16, opened.tasks.length));
  });

  it('the waiting tasks show what they wait on; the in-progress ones, the next step', () => {
    const tasks = [
      taskView('F1-04', 'blocked', { waitingOn: ['F1-01', 'F9-99(?)'] }),
      taskView('F1-05', 'in-progress', { nextStep: 'rodar <x>' }),
    ];
    const html = withPhases([phase({ title: 'F', dir: 'p0', done: 0, total: 2, pct: 0, tasks })], {}, { [ID]: ['p0'] });
    expect(html).toContain('espera F1-01, F9-99(?)');
    expect(html).toContain('rodar &lt;x&gt;');
  });
});

describe('render', () => {
  it('a title with <script>, ", & and \\ comes out escaped', () => {
    const evil = '<script>alert("x")</script> & \\ fim';
    const t = taskView('F1-01', 'available', { title: evil, file: 'a"b.md' });
    const html = render({
      plans: [plan({ name: evil, phases: [phase({ title: evil, done: 0, total: 1, pct: 0, tasks: [t] })] })],
      updated: '10:42',
      expanded: new Set(['/ws/agent_plans/a']),
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('alert("x")');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; \\ fim');
    expect(html).toContain('data-file="a&quot;b.md"');
  });

  it('a collapsed card shows name, stacked bar, progress and badge, without sections', () => {
    const html = render({ plans: [plan({ tasks: [taskView('F0-01', 'done'), taskView('F0-02', 'in-progress')] })], updated: '10:42' });
    expect(html).toContain('>a<');
    expect(html).toContain('class="stacked-bar"');
    expect(html).toContain('40% · 2/5');
    expect(html).toContain('em curso');
    expect(html).not.toContain('há 3 min');
    expect(html).toContain('aria-expanded="false"');
  });

  it('the stacked bar has one segment per status with a task, and the legend counts them', () => {
    const tasks = [taskView('F0-01', 'done'), taskView('F0-02', 'done'), taskView('F0-03', 'in-progress'), taskView('F0-04', 'available')];
    tasks.push(taskView('F0-05', 'cancelled'));
    const html = render({ plans: [plan({ tasks })], updated: '10:42' });
    expect(html.match(/<rect class="seg-[a-z]+"/g)).toEqual(['<rect class="seg-ok"', '<rect class="seg-run"', '<rect class="seg-free"']);
    expect(html).toContain('<i class="status-done"></i>2 concluídas');
    expect(html).toContain('<i class="status-in-progress"></i>1 em andamento');
    expect(html).toContain('<i class="status-available"></i>1 livres');
    expect(html).not.toContain('cancelled</i>');
  });

  it('an expanded card shows the phases; the actions stay at the top, open or not', () => {
    const html = render({ plans: [plan()], updated: '10:42', expanded: new Set(['/ws/agent_plans/a']) });
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Fase 0');
    expect(html).toContain('data-file="MAP.md"');
    expect(html.indexOf('data-action="run"')).toBeLessThan(html.indexOf('class="body"'));
    expect(render({ plans: [plan()], updated: '10:42' })).toContain('data-action="run"');
    expect(render({ plans: [plan()], updated: '10:42' })).not.toContain('class="sec-head"');
  });

  it('«Conduzir» is the primary button and «Mapa» sits beside it', () => {
    const html = render({ plans: [plan()], updated: '10:42' });
    expect(textOf(html, 'button.btn.pri[data-action="run"][data-plan="/ws/agent_plans/a"]')).toContain('Conduzir');
    expect(textOf(html, 'button.btn:not(.pri)[data-action="open"][data-plan="/ws/agent_plans/a"][data-file="MAP.md"]')).toContain('Mapa');
  });

  it('«Diário» only appears with a run and opens the plan log; «condução aberta» only with run.open', () => {
    expect(render({ plans: [plan()], updated: '10:42' })).not.toContain('>Diário<');
    const without = render({ plans: [plan({ log: 'notes/run.md', runOpen: false })], updated: '10:42' });
    expect(without).toMatch(/data-file="notes\/run.md">.*Diário<\/button>/);
    expect(without).not.toContain('condução aberta');
    expect(render({ plans: [plan({ log: 'notes/run.md', runOpen: true })], updated: '10:42' })).toContain('condução aberta');
  });

  it('the last button and the «⋯» go in a single group, so the «⋯» never falls alone on a line', () => {
    const withFilters = render({ plans: [plan({ log: 'notes/run.md' })], updated: '10:42' });
    expect(withFilters).toMatch(
      /<span class="pact-end"><button [^>]*data-file="notes\/run.md">.*?Diário<\/button><span class="sp"><\/span><span class="menu-wrap">/,
    );
    const without = render({ plans: [plan()], updated: '10:42' });
    expect(without).toMatch(
      /<span class="pact-end"><button [^>]*data-file="MAP.md">.*?Mapa<\/button><span class="sp"><\/span><span class="menu-wrap">/,
    );
    // Plan with an error: no buttons, the group has only the «⋯».
    const error = render({ plans: [plan({ error: 'quebrado' })], updated: '10:42' });
    expect(error).toContain('<span class="pact-end"><span class="sp"></span><span class="menu-wrap">');
  });

  it('with the «corrida aberta» badge the pill does not repeat the same thing (in English both said «run open»)', () => {
    const html = render({ plans: [plan({ log: 'notes/run.md', runOpen: true, badge: 'run-open' })], updated: '10:42' });
    expect(html).toContain('corrida aberta');
    expect(html).not.toContain('condução aberta');
  });

  it('«Apagar» only exists inside the «⋯» menu, which stays closed until opened', () => {
    const closed = render({ plans: [plan()], updated: '10:42', expanded: new Set(['/ws/agent_plans/a']) });
    expect(closed).not.toContain('data-action="delete"');
    expect(attributeOf(closed, '[data-action="menu"][data-plan="/ws/agent_plans/a"][aria-haspopup="menu"]', 'aria-expanded')).toBe('false');
    expect(closed).not.toContain('role="menu"');
    const isOpen = render({ plans: [plan()], updated: '10:42', menuOpen: '/ws/agent_plans/a' });
    expect(isOpen).toContain('aria-expanded="true"');
    const menu = elementOf(isOpen, '.menu[role="menu"]').outerHTML;
    expect(menu.match(/role="menuitem"/g)).toHaveLength(5);
    expect(menu).toContain('data-file="PLAN.md"');
    expect(menu).toContain('data-file="MAP.md"');
    expect(menu).toContain('data-file="README.md"');
    expect(hasElement(menu, '[data-action="copy"][data-plan="/ws/agent_plans/a"]')).toBe(true);
    // «Apagar» is the last item and carries the danger class.
    expect(menu.split('role="menuitem"').pop()).toContain('data-action="delete"');
    expect(hasElement(menu, '.mi.danger[data-action="delete"]')).toBe(true);
    expect(menu.indexOf('data-action="delete"')).toBeGreaterThan(menu.indexOf('data-action="copy"'));
  });

  it('the menu only opens on the requested plan', () => {
    const other = plan({ id: '/ws/agent_plans/b', name: 'b' });
    const html = render({ plans: [plan(), other], updated: '10:42', menuOpen: other.id });
    expect(html.match(/role="menu"/g)).toHaveLength(1);
    expect(html.indexOf('role="menu"')).toBeGreaterThan(html.indexOf('data-plan="/ws/agent_plans/b"'));
  });

  it('a plan with an error only opens PLAN and README and deletes, in the menu', () => {
    const html = render({ plans: [errorPlan('x')], updated: '10:42', menuOpen: '/ws/agent_plans/a' });
    expect(html).not.toContain('data-action="run"');
    expect(html).not.toContain('class="stacked-bar"');
    const menu = elementOf(html, '.menu[role="menu"]').outerHTML;
    expect(menu.match(/role="menuitem"/g)).toHaveLength(3);
    expect(menu).toContain('data-action="delete"');
    expect(menu).not.toContain('MAP.md');
  });

  describe('Now, Plans and Ideas as tabs', () => {
    const ideas = { items: [{ id: 'i.md', title: 'Ideia', status: 'open' as const, questions: 0 }], actions: [] };
    const withTab = (tab: 'now' | 'plans' | 'ideas' | undefined, plans = [plan()]): string =>
      render({ plans, updated: '10:42', ideas, tab });
    const tabs = (html: string): HTMLElement[] => within(parseHtml(html)).getAllByRole('tab');

    it('a tablist row with three tabs in the order Now, Plans, Ideas; Plans selected by default', () => {
      const html = withTab(undefined);
      expect(within(parseHtml(html)).getByRole('tablist', { name: 'Seções do painel' }).className).toBe('tabs-list');
      const buttons = tabs(html);
      expect(buttons.map((b) => b.dataset.tab)).toEqual(['now', 'plans', 'ideas']);
      expect(buttons.map((b) => b.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
      expect(buttons.map((b) => b.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
      for (const b of buttons) expect(b.getAttribute('aria-controls')).toBe('tab-panel');
      const panels = within(parseHtml(html)).getAllByRole('tabpanel');
      expect(panels).toHaveLength(1);
      expect(panels[0]?.id).toBe('tab-panel');
      expect(panels[0]?.className).toBe('tab-panel');
      expect(panels[0]?.getAttribute('aria-labelledby')).toBe('tab-plans');
      expect(html).not.toContain('data-action="section"');
      expect(html).not.toContain('vsec');
    });

    it('each tab has a title «Label (n)» and the label in the text, for the accessible name', () => {
      const html = withTab('plans', [plan({ tasks: [taskView('F0-01', 'in-progress'), taskView('F0-02', 'done')] })]);
      expect(tabs(html).map((b) => [b.dataset.tab, b.title])).toEqual([
        ['now', 'Agora (1)'],
        ['plans', 'Planos (1)'],
        ['ideas', 'Ideias (1)'],
      ]);
      // Without aria-label: the name comes from the text («Planos 1»), which the narrow CSS only hides from view.
      for (const b of tabs(html)) expect(b.hasAttribute('aria-label')).toBe(false);
      const view = within(parseHtml(html));
      for (const name of ['Agora 1', 'Planos 1', 'Ideias 1']) expect(view.getByRole('tab', { name })).toBeTruthy();
    });

    it('each tab carries its icon, its label and its counter', () => {
      const html = withTab('plans', [plan({ tasks: [taskView('F0-01', 'in-progress'), taskView('F0-02', 'done')] })]);
      const parts = (b: HTMLElement): string[] =>
        [...b.children].map((c) =>
          c.tagName.toLowerCase() === 'svg' ? (c.getAttribute('class') ?? '') : `${c.className}:${c.textContent}`,
        );
      expect(tabs(html).map(parts)).toEqual([
        ['ic ic-now', 'tab-label:Agora', 'counter:1'],
        ['ic ic-plans', 'tab-label:Planos', 'counter:1'],
        ['ic ic-ideas', 'tab-label:Ideias', 'counter:1'],
      ]);
    });

    it('with the Ideas tab, only the Ideas panel is drawn', () => {
      const html = withTab('ideas');
      expect(tabs(html).map((b) => b.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true']);
      expect(html).toContain('aria-labelledby="tab-ideas"');
      expect(html).toContain('class="plan expanded ideas-card"');
      expect(html).not.toContain('data-action="toggle"');
      // The search bar is the Ideas one, not the Plans one.
      expect(html).not.toContain('data-group=');
      expect(html).not.toContain('class="now');
    });

    it('with the Now tab, only the Now panel is drawn', () => {
      const html = withTab('now', [plan({ tasks: [taskView('F0-01', 'in-progress')] })]);
      expect(html).toContain('aria-labelledby="tab-now"');
      expect(html).toContain('class="plan expanded now-plan"');
      expect(html).not.toMatch(/class="plan( expanded)?"/);
      expect(html).not.toContain('ideas-cartao');
    });

    it('without ideas, the tab stays, with 0 and a line in the panel', () => {
      const html = render({ plans: [plan()], updated: '10:42', tab: 'ideas' });
      expect(html).toMatch(/<span class="tab-label">Ideias<\/span><span class="counter">0<\/span>/);
      expect(html).toContain('<p class="empty">Nenhuma ideia em <code>agent_plans/_ideas/</code> nesta pasta.</p>');
    });

    it('«Recolher tudo» sits in the row, after the tab list, only with the Plans tab and with a plan', () => {
      const collapse = elementOf(withTab('plans'), 'div.tabs > button.ib.tabs-action[data-action="collapse-all"]');
      expect(collapse.previousElementSibling?.className).toBe('tabs-list');
      expect(collapse.getAttribute('aria-label')).toBe('Recolher tudo');
      expect(collapse.title).toBe('Recolher tudo');
      expect(withTab('ideas')).not.toContain('data-action="collapse-all"');
      expect(withTab('now')).not.toContain('data-action="collapse-all"');
      expect(withTab('plans', [])).not.toContain('data-action="collapse-all"');
    });

    it('with the actions outside the row (host with a title bar), the row is just the tablist', () => {
      const withoutActions = (tab: 'now' | 'plans' | 'ideas'): string =>
        render({ plans: [plan()], updated: '10:42', ideas, tab, actionsInRow: false });
      for (const tab of ['now', 'plans', 'ideas'] as const) {
        const html = withoutActions(tab);
        expect(html).not.toContain('tabs-action');
        expect(html).not.toContain('tabs-status');
        const row = elementOf(html, 'div.tabs[aria-busy="false"]');
        expect([...row.children].map((c) => c.className)).toEqual(['tabs-list']);
        expect(row.nextElementSibling?.className).toBe('tab-panel');
      }
      // By default (ZCode Desktop, no title bar) the actions are still drawn.
      expect(withTab('plans')).toContain('data-action="refresh"');
    });

    it('counters: Now adds in progress, owner and available, highlighted when there is an owner task; Ideas only the open ones', () => {
      const tasks = [
        taskView('F0-01', 'in-progress'),
        taskView('F0-02', 'owner'),
        taskView('F0-03', 'available'),
        taskView('F0-04', 'blocked'),
        taskView('F0-05', 'done'),
      ];
      const varied = {
        items: [
          { id: 'a.md', title: 'A', status: 'open' as const, questions: 0 },
          { id: 'b.md', title: 'B', status: 'mapped' as const, questions: 0, plan: 'x' },
          { id: 'c.md', title: 'C', status: 'invalid' as const, questions: null },
        ],
        actions: [],
      };
      const html = render({ plans: [plan({ tasks: tasks })], updated: '10:42', ideas: varied });
      const counter = elementOf(html, '[role="tab"][data-tab="now"] .counter');
      // The number is drawn; the owner count is hidden text for a screen reader.
      expect([counter.className, counter.title, counter.textContent]).toEqual([
        'counter owner',
        '1 esperando por você',
        '3, 1 esperando por você',
      ]);
      expect(textOf(html, '[role="tab"][data-tab="now"] .counter .vh')).toBe(', 1 esperando por você');
      expect(html).toMatch(/<span class="tab-label">Ideias<\/span><span class="counter">1<\/span>/);
      expect(attributeOf(html, '[role="tab"][data-tab="now"]', 'title')).toBe('Agora (3)');
      // Without an owner task, the Now counter has no highlight.
      const withoutOwner = render({ plans: [plan({ tasks: [taskView('F0-01', 'available')] })], updated: '10:42' });
      expect(withoutOwner).toMatch(/<span class="tab-label">Agora<\/span><span class="counter">1<\/span>/);
    });

    it('the tabs come in English with the English strings', () => {
      const html = render({ plans: [plan()], updated: '10:42', strings: stringsFor('en') });
      expect(html).toContain('aria-label="Panel sections"');
      expect(html).toContain('<span class="tab-label">Now</span>');
    });
  });

  describe('«Now» with a card, sections and rows', () => {
    const nowTab = (plans: PlanView[], openPhases: Record<string, readonly string[]> = {}, pages: Record<string, number> = {}): string =>
      render({ plans, updated: '10:42', tab: 'now', openPhases, pages });
    const headOf = (g: string): string => `[data-action="now-section"][data-plan="/ws/agent_plans/a"][data-group="${g}"]`;
    const sectionOf = (html: string, g: string): HTMLElement => {
      const section = elementOf(html, headOf(g)).closest<HTMLElement>('.sec');
      if (!section) throw new Error(`the ${g} header is outside a section`);
      return section;
    };

    it('the card has the plan name, «Conduzir» and, with a run, «Diário»', () => {
      const a = nowTab([plan({ tasks: [taskView('F1-01', 'available')], log: 'notes/run.md' })]);
      expect(a).toContain('<article class="plan expanded now-plan">');
      expect(a).toContain('<span class="name">a</span>');
      expect(hasElement(a, '[data-action="run"][data-plan="/ws/agent_plans/a"]')).toBe(true);
      expect(a).toContain('data-file="notes/run.md"');
      expect(a).toContain('Diário');
    });

    it('two plans give two cards, the one with an owner task first', () => {
      const b = plan({ id: '/ws/agent_plans/b', name: 'b', tasks: [taskView('G0-01', 'owner')] });
      const a = nowTab([plan({ tasks: [taskView('F1-01', 'available')] }), b]);
      expect(a.match(/<article class="plan expanded now-plan">/g)).toHaveLength(2);
      expect(a.indexOf('<span class="name">b</span>')).toBeLessThan(a.indexOf('<span class="name">a</span>'));
    });

    it('the sections in the order in progress, waiting for you, available and unblock next; the header has the icon, the rows do not', () => {
      const tasks = [
        taskView('F1-03', 'blocked', { waitingOn: ['F1-01'] }),
        taskView('F1-01', 'available'),
        taskView('F1-02', 'owner'),
        taskView('F0-02', 'in-progress'),
      ];
      const a = nowTab([plan({ tasks })]);
      const heads = parseHtml(a).querySelectorAll<HTMLElement>('[data-action="now-section"][data-plan="/ws/agent_plans/a"]');
      expect([...heads].map((h) => h.dataset.group)).toEqual(['in-progress', 'owner', 'available', 'blocked']);
      const available = sectionOf(a, 'available');
      const lines = available.querySelector('ul');
      expect(available.querySelector('.ic-status')).not.toBeNull();
      expect(lines?.querySelector('li[class="ln group-available no-ic"]')).not.toBeNull();
      expect(lines?.querySelector('.ic-status')).toBeNull();
      expect(a).toContain('Esperando você');
    });

    it('10 available become 8 and «mostrar mais 2»; with the page open, all 10', () => {
      const tasks = Array.from({ length: 10 }, (_, i) => taskView(`F1-${String(i).padStart(2, '0')}`, 'available'));
      const a = nowTab([plan({ tasks })]);
      const available = sectionOf(a, 'available');
      expect(available.querySelectorAll('li.ln.group-available')).toHaveLength(8);
      const more = available.querySelector('[data-action="more"][data-plan="/ws/agent_plans/a"][data-phase="now:available"]');
      expect(more?.textContent).toContain('Mostrar mais 2 · faltam 2');
      const all = nowTab([plan({ tasks })], {}, { [pageKey('/ws/agent_plans/a', 'now:available')]: 16 });
      expect(sectionOf(all, 'available').querySelectorAll('li.ln.group-available')).toHaveLength(10);
    });

    it('the sections open by default and close through Saved', () => {
      const tasks = [taskView('F1-01', 'available'), taskView('F1-02', 'owner')];
      const opened = nowTab([plan({ tasks })]);
      expect(attributeOf(opened, headOf('available'), 'aria-expanded')).toBe('true');
      const closed = nowTab([plan({ tasks })], { [nowKey('/ws/agent_plans/a')]: ['owner'] });
      expect(attributeOf(closed, headOf('available'), 'aria-expanded')).toBe('false');
      expect(sectionOf(closed, 'available').outerHTML).not.toContain('F1-01');
      expect(attributeOf(closed, headOf('owner'), 'aria-expanded')).toBe('true');
    });

    it('the subline: waiting, unblocks, duration, next step, the phase and «pode rodar em outra sessão», without ▶', () => {
      const tasks = [
        taskView('F0-02', 'in-progress', { duration: 90, nextStep: 'testar o passo 3' }),
        taskView('F1-01', 'available', { pendingUnblocks: 2 }),
        taskView('F1-03', 'blocked', { waitingOn: ['F1-01'] }),
      ];
      const a = nowTab([plan({ tasks, parallel: ['F1-01'] })]);
      expect(a).toMatch(/<div class="sub"[^>]*>há 1 h 30 min · testar o passo 3 · Fase 0<\/div>/);
      expect(a).toMatch(/<div class="sub"[^>]*>destrava 2 · Fase 0 · pode rodar em outra sessão<\/div>/);
      expect(a).toMatch(/<div class="sub"[^>]*>espera F1-01 · Fase 0<\/div>/);
      const available = sectionOf(a, 'available');
      // The only ▶ on the available row is the Execute button.
      expect(available.outerHTML.match(/ic-play/g)).toHaveLength(1);
    });

    it('the row executes through the ▶ and the body opens the detail, including on the blocked one', () => {
      const tasks = [taskView('F0-02', 'in-progress'), taskView('F1-03', 'blocked', { waitingOn: ['X'] })];
      const a = nowTab([plan({ tasks })]);
      expect(hasElement(a, '[data-action="execute"][data-plan="/ws/agent_plans/a"][data-id="F0-02"]')).toBe(true);
      expect(a).toContain('Retomar');
      expect(hasElement(a, '.ln-body[data-action="detail"][data-plan="/ws/agent_plans/a"][data-id="F1-03"]')).toBe(true);
      expect(hasElement(a, '[data-action="execute"][data-plan="/ws/agent_plans/a"][data-id="F1-03"]')).toBe(false);
    });

    it('with nothing to do, one line: what unblocks next or everything done (no card)', () => {
      const idle = nowTab([plan({ tasks: [taskView('F1-03', 'blocked', { waitingOn: ['X'] })] })]);
      expect(idle).toContain('class="now-empty"');
      expect(idle).toContain('Destravam a seguir');
      const finished = nowTab([plan({ tasks: [taskView('F1-03', 'done')] })]);
      expect(finished).toContain('Tudo concluído.');
      expect(finished).not.toContain('now-plan');
    });

    it('the card tree has a single item in the Tab order', () => {
      const a = nowTab([plan({ tasks: [taskView('F1-01', 'available'), taskView('F1-02', 'available')] })]);
      expect(a).toContain('role="tree"');
      expect(parseHtml(a).querySelectorAll('[role="treeitem"][tabindex="0"]')).toHaveLength(1);
    });

    it('the plan text is escaped and, with another tab, there are no Now cards', () => {
      const t = taskView('F0-02', 'in-progress', { title: '<img src=x>' });
      expect(nowTab([plan({ tasks: [t], name: '<b>' })])).not.toMatch(/<img|<b>/);
      expect(render({ plans: [plan({ tasks: [t] })], updated: '10:42' })).not.toContain('now-plan');
    });
  });

  it('a completed plan shows the completed badge', () => {
    const html = render({ plans: [plan({ badge: 'done', pct: 100, done: 5 })], updated: '10:42' });
    expect(html).toContain('<span class="badge badge-done">concluído</span>');
  });

  it('the badge class comes from the identifier and the text from the label', () => {
    const html = render({ plans: [plan({ badge: 'owner' })], updated: '10:42' });
    expect(html).toContain('<span class="badge badge-owner">precisa de você</span>');
  });

  it('changing the label does not change the badge class', () => {
    const strings = createStrings('en', { ...ptBR, 'badge.owner': 'needs you' });
    const html = render({ plans: [plan({ badge: 'owner' })], updated: '10:42', strings });
    expect(html).toContain('<span class="badge badge-owner">needs you</span>');
    expect(html).not.toContain(ptBR['badge.owner']);
  });

  it('a plan with an error has the error badge, with the label «erro»', () => {
    const html = render({ plans: [errorPlan('x')], updated: '10:42' });
    expect(html).toContain('<span class="badge badge-error">erro</span>');
  });

  it('every badge has a label, and the identifier is ASCII without spaces', () => {
    for (const id of CARD_BADGES) {
      expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(badgeLabel(id, stringsFor('pt-BR')).length).toBeGreaterThan(0);
    }
  });

  it('the «Now» tab does not say everything is done when every plan failed to read', () => {
    const b = { ...errorPlan('y'), id: '/ws/agent_plans/b', name: 'b' };
    const html = render({ plans: [errorPlan('x'), b], updated: '10:42', tab: 'now' });
    expect(html).not.toContain('Tudo concluído.');
    const oneGood = render({
      plans: [errorPlan('x'), plan({ id: '/ws/agent_plans/c', phases: [], tasks: [] })],
      updated: '10:42',
      tab: 'now',
    });
    expect(oneGood).toContain('Tudo concluído.');
  });

  it('a plan with an error shows the error', () => {
    const html = render({ plans: [errorPlan('status.sh <saiu> com 1')], updated: '10:42' });
    expect(html).toContain('status.sh &lt;saiu&gt; com 1');
  });

  it('with the plugin active, the top is only the row: a status icon with the two-line tooltip and the refresh icon', () => {
    const html = render({ plans: [plan()], updated: '10:42', plugin: { state: 'active-project', scope: 'project' } });
    expect(html).not.toContain('<header');
    expect(html).not.toContain('plugin-status');
    expect(html).not.toContain('class="updated"');
    const tooltip = 'Plugin ativo (projeto) · Atualizado às 10:42';
    const status = elementOf(html, 'span.ib.tabs-status');
    expect([status.getAttribute('role'), status.getAttribute('aria-label'), status.title]).toEqual(['img', tooltip, tooltip]);
    const refresh = elementOf(html, 'button.ib.tabs-action[data-action="refresh"]');
    expect([refresh.getAttribute('aria-label'), refresh.title]).toEqual(['Atualizar', 'Atualizar']);
    expect(refresh.firstElementChild?.getAttribute('class')).toContain('ic-refresh');
    // Both icons sit after the tablist, on the same row.
    expect(html.indexOf('tabs-status')).toBeGreaterThan(html.indexOf('</div>', html.indexOf('role="tablist"')));
  });

  it('without a plugin status yet, the tooltip says «verificando»; the time goes along', () => {
    const html = render({ plans: [plan()], updated: '10:42' });
    expect(html).toContain('title="verificando o plugin… · Atualizado às 10:42"');
  });

  it('without a read in progress, the Refresh button is enabled and the row is not busy', () => {
    const html = render({ plans: [plan()], updated: '10:42', plugin: { state: 'active-project', scope: 'project' } });
    expect(html).not.toContain('disabled');
    expect(html).not.toContain('aria-busy="true"');
  });

  it('with a read in progress, the button is disabled and the row busy; the aria-label stays «Atualizar»', () => {
    const html = render({ plans: [plan()], updated: '10:42', loading: true, plugin: { state: 'active-project', scope: 'project' } });
    const refresh = elementOf(html, 'button[data-action="refresh"]');
    expect(refresh.getAttribute('aria-label')).toBe('Atualizar');
    expect(refresh.hasAttribute('disabled')).toBe(true);
    expect(hasElement(html, 'div.tabs[aria-busy="true"]')).toBe(true);
    expect(html).toContain('Atualizado às 10:42');
    expect(html).toContain('40%');
  });

  it('a plugin that asks for action keeps the text line, and the time stays in the tooltip', () => {
    const html = render({ plans: [plan()], updated: '10:42', plugin: { state: 'not-installed' } });
    expect(html).toContain('<header class="top"');
    expect(html).toContain('Plugin não instalado');
    expect(html).toContain('data-action="install"');
    expect(html).toContain('title="Plugin não instalado · Atualizado às 10:42"');
  });

  it('an active plugin with a new version in the folder also keeps the line', () => {
    const html = render({
      plans: [plan()],
      updated: '10:42',
      plugin: {
        state: 'active-project',
        scope: 'project',
        newVersion: { registered: '0.1.0', folder: '0.2.0' },
      },
    });
    expect(html).toContain('<header class="top"');
  });

  it('an empty list gives the sentence «Nenhum plano…»', () => {
    const html = render({ plans: [], updated: '10:42' });
    expect(html).toContain('Nenhum plano em <code>agent_plans/</code> nesta pasta.');
    expect(html).toContain('Atualizado às 10:42');
    expect(html).toContain('data-action="refresh"');
  });
});

describe('render — Execute, Resume and Run', () => {
  const EXP = new Set(['/ws/agent_plans/a']);
  const withFilters = (group: TaskView['group'], id = 'F1-01', planId = '/ws/agent_plans/a') =>
    render({
      plans: [plan({ id: planId, phases: [phase({ title: 'F', done: 0, total: 1, pct: 0, tasks: [taskView(id, group)] })] })],
      updated: '10:42',
      expanded: new Set([planId]),
      openPhases: { [planId]: ['phase-0'] },
    });
  /** The label of the row's execute button (`aria-label` and `title` equal, out of the Tab order), or null without one. */
  const button = (html: string): string | null => {
    const el = parseHtml(html).querySelector('button.ib.run[data-action="execute"][data-plan="/ws/agent_plans/a"][data-id="F1-01"]');
    if (!el) return null;
    expect(el.getAttribute('tabindex')).toBe('-1');
    expect(el.getAttribute('title')).toBe(el.getAttribute('aria-label'));
    return el.getAttribute('aria-label');
  };

  it('available has «Executar»', () => {
    const html = withFilters('available');
    expect(button(html)).toBe('Executar');
    expect(html).not.toContain('Retomar');
  });

  it('owner has «Executar»', () => {
    expect(button(withFilters('owner'))).toBe('Executar');
  });

  it('in progress has «Retomar»', () => {
    const html = withFilters('in-progress');
    expect(button(html)).toBe('Retomar');
    expect(html).not.toContain('Executar');
  });

  it('waiting, draft, done and cancelled have no execute button', () => {
    for (const g of ['blocked', 'draft', 'done', 'cancelled'] as const) expect(withFilters(g)).not.toContain('data-action="execute"');
  });

  it('«Desistir» on hover only for ready and draft tasks', () => {
    const giveUp =
      'button.ib[data-action="giveUp"][data-plan="/ws/agent_plans/a"][data-id="F1-01"][aria-label="Desistir"][title="Desistir"][tabindex="-1"]';
    for (const g of ['available', 'owner', 'blocked', 'draft'] as const) expect(hasElement(withFilters(g), giveUp), g).toBe(true);
    for (const g of ['in-progress', 'done', 'cancelled', 'abandoned', 'invalid'] as const)
      expect(withFilters(g), g).not.toContain('data-action="giveUp"');
  });

  it('«Reabrir» only on the root of a give-up', () => {
    const single = (t: TaskView) =>
      render({
        plans: [plan({ phases: [phase({ title: 'F', done: 0, total: 0, pct: 0, tasks: [t] })] })],
        updated: '10:42',
        expanded: EXP,
        openPhases: { '/ws/agent_plans/a': ['phase-0'] },
      });
    const root = single(taskView('F1-01', 'abandoned', { ownerGiveUp: true }));
    expect(
      hasElement(
        root,
        'button.ib[data-action="reopen"][data-plan="/ws/agent_plans/a"][data-id="F1-01"][aria-label="Reabrir"][title="Reabrir"][tabindex="-1"]',
      ),
    ).toBe(true);
    expect(single(taskView('F1-01', 'abandoned', { giveUpRoot: 'F0-01' }))).not.toContain('data-action="reopen"');
    for (const g of ['available', 'draft', 'cancelled'] as const) expect(withFilters(g), g).not.toContain('data-action="reopen"');
  });

  it('every task has the button to open the file', () => {
    expect(attributeOf(withFilters('done'), '.ib[data-action="open"][data-file="phase-0/F1-01.md"]', 'aria-label')).toBe('Abrir arquivo');
  });

  it('the ID and the plan go escaped in the button', () => {
    const html = withFilters('available', 'F1-01"><b>', '/ws/"a"');
    expect(html).toContain('data-action="execute" data-plan="/ws/&quot;a&quot;" data-id="F1-01&quot;&gt;&lt;b&gt;"');
    expect(html).not.toContain('<b>');
  });

  it('«Conduzir» is in the card actions, open or collapsed', () => {
    const run = 'button[data-action="run"][data-plan="/ws/agent_plans/a"]';
    expect(textOf(render({ plans: [plan()], updated: '10:42', expanded: EXP }), run)).toContain('Conduzir');
    expect(textOf(render({ plans: [plan()], updated: '10:42' }), run)).toContain('Conduzir');
  });
});

describe('render — plugin at the top', () => {
  // The top line (`<header>`), or '' when the plugin asks for nothing and it disappears.
  const topNotice = (plugin: RenderInput['plugin']) =>
    /<header class="top".*?<\/header>/s.exec(render({ plans: [plan()], updated: '10:42', plugin }))?.[0] ?? '';

  it('without a plugin status, the top says it is checking', () => {
    expect(topNotice(undefined)).toContain('verificando o plugin…');
  });

  it('active in the project: no line, the status is only in the tooltip', () => {
    const html = render({ plans: [plan()], updated: '10:42', plugin: { state: 'active-project', scope: 'project' } });
    expect(topNotice({ state: 'active-project', scope: 'project' })).toBe('');
    expect(html).toContain('title="Plugin ativo (projeto) · Atualizado às 10:42"');
    expect(html).not.toContain('data-action="install"');
  });

  it('active for the user', () => {
    expect(topNotice({ state: 'active-user', scope: 'user' })).toBe('');
    expect(render({ plans: [plan()], updated: '10:42', plugin: { state: 'active-user', scope: 'user' } })).toContain(
      'Plugin ativo (usuário) ·',
    );
  });

  it('not installed shows the «Instalar» button', () => {
    const h = topNotice({ state: 'not-installed' });
    expect(h).toContain('Plugin não instalado');
    expect(h).toMatch(/<button[^>]*data-action="install"[^>]*>Instalar<\/button>/);
  });

  it('installed but disabled says the scope, without «Instalar»', () => {
    const h = topNotice({ state: 'inactive', scope: 'project' });
    expect(h).toContain('Plugin desligado (projeto)');
    expect(h).not.toContain('data-action="install"');
  });

  it('an error shows the escaped message and lets you try to install', () => {
    const h = topNotice({ state: 'error', error: 'agente <não> arrancou' });
    expect(h).toContain('Plugin: erro — agente &lt;não&gt; arrancou');
    expect(h).not.toContain('<não>');
  });

  it('installing: the button stays in place, disabled, with «Instalando…», and the top busy', () => {
    const h = topNotice({ state: 'installing' });
    expect(h).toContain('instalando o plugin…');
    const install = elementOf(h, 'button[data-action="install"]');
    expect(install.hasAttribute('disabled')).toBe(true);
    expect(install.textContent).toBe('Instalando…');
    expect(hasElement(render({ plans: [plan()], updated: '10:42', plugin: { state: 'installing' } }), 'div.tabs[aria-busy="true"]')).toBe(
      true,
    );
  });

  it('a new version in the folder appears with both versions', () => {
    const h = topNotice({ state: 'active-project', scope: 'project', newVersion: { registered: '0.1.0', folder: '0.2.0' } });
    expect(h).toContain('versão nova na pasta (0.1.0 → 0.2.0)');
  });

  it('the host notices go in the top, escaped, after the plugin; without them, nothing', () => {
    const h =
      render({ plans: [plan()], updated: '10:42', plugin: { state: 'not-installed' }, notices: ['extensão <0.0.1> velha'] }).split(
        '</header>',
      )[0] ?? '';
    expect(h).toContain('<header class="top"');
    expect(h).toContain('<p class="host-notice" data-announce>extensão &lt;0.0.1&gt; velha</p>');
    expect(h.indexOf('host-notice')).toBeGreaterThan(h.indexOf('plugin-status'));
    expect(topNotice({ state: 'active-project', scope: 'project' })).not.toContain('host-notice');
    expect(render({ plans: [], updated: '10:42', notices: ['x'] })).toContain('host-notice');
    // With the plugin up to date, a host notice alone still opens the top, without the plugin line.
    const so = render({ plans: [plan()], updated: '10:42', plugin: { state: 'active-project', scope: 'project' }, notices: ['x'] });
    expect(so).toContain('<header class="top"');
    expect(so).toContain('host-notice');
    expect(so).not.toContain('plugin-status');
  });

  it('the empty list also shows the plugin', () => {
    expect(render({ plans: [], updated: '10:42', plugin: { state: 'not-installed' } })).toContain('data-action="install"');
  });
});

describe('render — layout', () => {
  const EXP = new Set(['/ws/agent_plans/a']);

  it('the plan actions come right below the header, before the phases', () => {
    const html = render({ plans: [plan()], updated: '10:42', expanded: EXP });
    const actions = html.indexOf('class="pact"');
    expect(actions).toBeGreaterThan(html.indexOf('class="header"'));
    expect(actions).toBeLessThan(html.indexOf('class="sec-head"'));
  });

  it('«Apagar» is the last item of the menu, with the danger class', () => {
    const html = render({ plans: [plan()], updated: '10:42', expanded: EXP, menuOpen: '/ws/agent_plans/a' });
    const last = elementOf(html, '.menu[role="menu"]').lastElementChild;
    expect(last?.tagName).toBe('BUTTON');
    expect(last?.className).toBe('mi danger');
    expect(last?.textContent).toContain('Apagar plano…');
  });

  it('«Executar» and «Retomar» carry the play icon as SVG, with only the label in the aria-label', () => {
    const t = taskView('F1-01', 'available');
    const html = render({
      plans: [plan({ phases: [phase({ title: 'F', done: 0, total: 1, pct: 0, tasks: [t] })] })],
      updated: '10:42',
      expanded: EXP,
    });
    const run = elementOf(html, '[aria-label="Executar"][title="Executar"][tabindex="-1"]');
    expect(run.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(run.firstElementChild?.getAttribute('class')).toBe('ic ic-play');
  });
});

describe('task detail', () => {
  const ID = '/ws/agent_plans/a';
  /** A plan with the tasks given in `tasks` (and in the phase), so the detail finds the task and its neighbours. */
  const withFilters = (tasks: TaskView[]): PlanView =>
    plan({ id: ID, tasks, phases: [phase({ title: 'Fase 0', dir: 'phase-0', done: 0, total: tasks.length, pct: 0, tasks })] });

  it('is a modal <dialog> labeled by the title, with ID, status, phase and the fields', () => {
    const t = taskView('F1-01', 'in-progress', {
      title: 'Fazer <b>x</b>',
      type: 'code',
      track: 'panel',
      tier: 'senior',
      repos: ['core', 'host'],
      started: '2026-11-15T10:00Z',
      duration: 125,
      nextStep: 'rodar os testes',
    });
    const html = taskDetail(withFilters([t]), 'F1-01', stringsFor('pt-BR'));
    const dialog = parseHtml(html).firstElementChild;
    expect(dialog?.tagName).toBe('DIALOG');
    expect(dialog?.className).toBe('dlg');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('dlg-title');
    expect(html).toContain('<h2 id="dlg-title">Fazer &lt;b&gt;x&lt;/b&gt;</h2>');
    expect(html).toContain('<span class="id">F1-01</span>');
    expect(html).toContain('em andamento');
    expect(html).toContain('<dt>Fase</dt><dd>Fase 0</dd>');
    expect(html).toContain('<dt>Tipo</dt><dd>code</dd>');
    expect(html).toContain('<dt>Trilha</dt><dd>panel</dd>');
    expect(html).toContain('<dt>Tier</dt><dd>senior</dd>');
    expect(html).toContain('<dt>Repos</dt><dd>core, host</dd>');
    expect(html).toContain('<dt>Começou</dt><dd>2026-11-15 10:00 UTC</dd>');
    expect(html).toContain('<dt>Duração</dt><dd>2 h 5 min</dd>');
    expect(html).toContain('<dt>Arquivo</dt><dd class="file">phase-0/F1-01.md</dd>');
    expect(html).toContain('<div class="box">rodar os testes</div>');
  });

  it('what is empty becomes «—» and the next step «—» or absent does not appear', () => {
    for (const nextStep of [null, '—', '']) {
      const html = taskDetail(withFilters([taskView('F1-01', 'draft', { nextStep })]), 'F1-01', stringsFor('pt-BR'));
      expect(html, String(nextStep)).not.toContain('class="box"');
      expect(html).not.toContain('Próximo passo');
    }
    const html = taskDetail(withFilters([taskView('F1-01', 'draft', { track: '', repos: [] })]), 'F1-01', stringsFor('pt-BR'));
    expect(html).toContain('<dt>Trilha</dt><dd>—</dd>');
    expect(html).toContain('<dt>Repos</dt><dd>—</dd>');
    expect(html).toContain('<dt>Começou</dt><dd>—</dd>');
    expect(html).toContain('<dt>Terminou</dt><dd>—</dd>');
    expect(html).toContain('<dt>Duração</dt><dd>—</dd>');
    expect(html).toContain('nenhuma');
  });

  it('«Depende de» marks the ones that are missing (waiting_on) and brings the nonexistent ID marked and without a click', () => {
    const a = taskView('F1-01', 'done');
    const b = taskView('F1-02', 'in-progress');
    const c = taskView('F1-03', 'blocked', { blockedBy: ['F1-01', 'F1-02', 'F9-99'], waitingOn: ['F1-02'] });
    const html = taskDetail(withFilters([a, b, c]), 'F1-03', stringsFor('pt-BR'));
    expect(html).toContain('Depende de (3) · faltam 1');
    expect(hasElement(html, 'button[class="dep"][data-action="detail"][data-id="F1-01"]')).toBe(true);
    expect(attributeOf(html, 'button[class="dep missing"][data-action="detail"][data-id="F1-02"]', 'title')).toBe('falta');
    expect(textOf(html, 'span[class="dep nonexistent"][title="não existe neste plano"]')).toBe('F9-99');
    expect(html).not.toMatch(/data-id="F9-99"/);
  });

  it('«Destrava» lists the tasks that wait on this one, clickable', () => {
    const a = taskView('F1-01', 'done', { unblocks: ['F1-02'] });
    const b = taskView('F1-02', 'blocked', { blockedBy: ['F1-01'] });
    const html = taskDetail(withFilters([a, b]), 'F1-01', stringsFor('pt-BR'));
    expect(html).toContain('Destrava (1)');
    expect(hasElement(html, 'button[class="dep"][data-id="F1-02"]')).toBe(true);
  });

  it('the footer buttons follow the group: Resume, Execute or none, always Open file; Copy command only where there is Execute', () => {
    const footer = (group: TaskView['group']): string => {
      const html = taskDetail(withFilters([taskView('F1-01', group)]), 'F1-01', stringsFor('pt-BR'));
      return elementOf(html, 'div.df').outerHTML;
    };
    expect(footer('in-progress')).toContain('Retomar');
    expect(hasElement(footer('in-progress'), '[data-action="execute"][data-plan="/ws/agent_plans/a"][data-id="F1-01"]')).toBe(true);
    expect(footer('available')).toContain('Executar');
    expect(footer('owner')).toContain('Executar');
    for (const g of ['done', 'blocked', 'draft', 'cancelled', 'invalid'] as const) {
      expect(footer(g), g).not.toContain('data-action="execute"');
    }
    for (const g of ['done', 'available', 'blocked'] as const) {
      expect(hasElement(footer(g), '[data-action="open"][data-plan="/ws/agent_plans/a"][data-file="phase-0/F1-01.md"]'), g).toBe(true);
    }
    // The host only copies the command of a task that has Execute/Resume (`actionTarget`); on the others the button would do nothing.
    for (const g of ['in-progress', 'available', 'owner'] as const) {
      expect(hasElement(footer(g), '[data-action="copy"][data-plan="/ws/agent_plans/a"][data-id="F1-01"]'), g).toBe(true);
      expect(footer(g), g).toContain('Copiar comando');
    }
    for (const g of ['done', 'blocked', 'draft', 'cancelled', 'invalid'] as const) {
      expect(footer(g), g).not.toContain('data-action="copy"');
    }
  });

  it('the close button has a label; a nonexistent task draws nothing', () => {
    const html = taskDetail(withFilters([taskView('F1-01', 'done')]), 'F1-01', stringsFor('pt-BR'));
    // The <dialog> is not open yet (showModal comes later), so its content is outside the accessibility tree.
    expect(within(parseHtml(html)).getByRole('button', { name: 'Fechar', hidden: true }).dataset.action).toBe('close');
    expect(taskDetail(withFilters([]), 'F1-01', stringsFor('pt-BR'))).toBe('');
  });

  it('the task row opens the detail through the body and the «detail» button; the file stays on the hover button', () => {
    const t = taskView('F1-01', 'available');
    const p = withFilters([t]);
    const html = render({
      plans: [p],
      updated: '10:42',
      expanded: new Set([ID]),
      openPhases: {
        [ID]: ['phase-0'],
      },
    });
    const body = elementOf(html, '.ln-body[role="treeitem"][data-action="detail"][data-plan="/ws/agent_plans/a"][data-id="F1-01"]');
    expect([body.getAttribute('tabindex'), body.getAttribute('aria-level')]).toEqual(['-1', '2']);
    expect(body.getAttribute('aria-label')).toMatch(/^F1-01 — /);
    expect(attributeOf(html, 'button.ib[data-action="detail"][data-plan="/ws/agent_plans/a"][data-id="F1-01"]', 'aria-label')).toBe(
      'Detalhe',
    );
    expect(hasElement(html, 'button.ib[data-action="open"][data-plan="/ws/agent_plans/a"][data-file="phase-0/F1-01.md"]')).toBe(true);
  });

  it('render draws the popup after the panel when there is an open detail, and nothing without it', () => {
    const p = withFilters([taskView('F1-01', 'available')]);
    const input = { plans: [p], updated: '10:42', expanded: new Set([ID]) };
    const without = render(input);
    expect(without).not.toContain('<dialog');
    const com1 = render({ ...input, detail: { plan: ID, id: 'F1-01' } });
    expect(com1).toContain('<dialog class="dlg"');
    expect(com1.indexOf('<dialog')).toBeGreaterThan(com1.indexOf('class="plan'));
    expect(render({ ...input, detail: { plan: ID, id: 'F9-99' } })).not.toContain('<dialog');
  });
});

describe('render — search, filters and by-status view', () => {
  const ID = '/ws/agent_plans/a';
  /** The Plans section; «Now» also lists available tasks. */
  const onlyPlans = (html: string) => html.slice(html.indexOf('role="tabpanel"'));
  const t8 = [
    taskView('F8-01', 'available', { phase: 'p8', file: 'p8/F8-01.md' }),
    taskView('F8-02', 'draft', { phase: 'p8', track: 'ci' }),
  ];
  const t1 = [taskView('F1-01', 'done', { phase: 'p1' }), taskView('F1-02', 'cancelled', { phase: 'p1' })];
  const p = (): PlanView =>
    plan({
      phases: [
        phase({ dir: 'p1', title: 'Um', done: 1, total: 2, pct: 50, tasks: t1 }),
        phase({ dir: 'p8', title: 'Oito', done: 0, total: 2, pct: 0, tasks: t8 }),
      ],
      tasks: [...t1, ...t8],
    });
  const withFilters = (filters: RenderInput['filters'], view?: 'phase' | 'status', opened: Record<string, string[]> = {}) =>
    render({ plans: [p()], updated: '10:42', expanded: new Set([ID]), openPhases: opened, filters, view, tabBar: { advanced: true } });

  it('the bar brings the search, the chips with counts, the selectors and the view; without a filter there is no «n de m»', () => {
    const html = withFilters(undefined);
    const search = elementOf(html, 'input.search[data-field="q"]');
    expect([search.getAttribute('type'), search.getAttribute('value')]).toEqual(['search', '']);
    expect(chipOf(html, '.chip[data-group="draft"]')).toEqual(['chip status-draft', 'false', 'rascunho', '1']);
    expect(html).toContain('<option value="ci">ci</option>');
    expect(html).toContain('data-field="tier"');
    expect(hasElement(html, '.seg.on[data-view="phase"]')).toBe(true);
    expect(html).not.toContain('data-action="clear"');
    expect(html).not.toContain('class="nm"');
  });

  it('searching F8 shows only phase 8, open, with the term highlighted, «n de m» and «limpar»', () => {
    const html = withFilters({ q: 'f8', groups: [], track: '', tier: '' });
    expect(html).toContain('data-phase="p8"');
    expect(html).not.toContain('data-phase="p1"');
    expect(attributeOf(html, '[data-phase="p8"][aria-expanded]', 'aria-expanded')).toBe('true');
    expect(html).toContain('<mark>F8</mark>-01');
    expect(textOf(html, 'span.nm[data-announce]')).toBe('2 de 4');
    expect(html).toContain('data-action="clear"');
  });

  it('with a filter in effect, a clear «×» sits next to the search field, with a label', () => {
    const searchRow = (html: string): string => elementOf(html, 'div.search-row').outerHTML;
    const active = searchRow(withFilters({ q: 'f8', groups: [], track: '', tier: '' }));
    expect(active).toContain('data-field="q"');
    const clear = elementOf(active, 'button.ib[data-action="clear"]');
    expect([clear.getAttribute('aria-label'), clear.title]).toEqual(['Limpar filtros', 'Limpar filtros']);
    expect(searchRow(withFilters({ q: '', groups: ['draft'], track: '', tier: '' }))).toContain('data-action="clear"');
    const idle = searchRow(withFilters(undefined));
    expect(idle).toContain('data-field="q"');
    expect(idle).not.toContain('data-action="clear"');
  });

  it('the filter beats the open/closed choice, and the chip counts ignoring its own status', () => {
    const html = withFilters({ q: '', groups: ['draft'], track: '', tier: '' }, 'phase', { [ID]: [] });
    expect(html).toContain('F8-02');
    expect(onlyPlans(html)).not.toContain('>F8-01<');
    expect(chipOf(html, '.chip[data-group="available"]')).toEqual(['chip status-available', 'false', 'livres', '1']);
    expect(chipOf(html, '.chip[data-group="draft"]').slice(0, 2)).toEqual(['chip status-draft on', 'true']);
  });

  it('track and tier filter; with no result it says nothing was found', () => {
    expect(onlyPlans(withFilters({ q: '', groups: [], track: 'ci', tier: '' }))).not.toContain('>F8-01<');
    const html = withFilters({ q: '', groups: [], track: '', tier: 'senior' });
    expect(html).toContain('class="empty no-result"');
    expect(html).not.toContain('class="plan');
  });

  it('the term does not inject HTML or split entities', () => {
    const html = withFilters({ q: '<script>', groups: [], track: '', tier: '' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('value="&lt;script&gt;"');
  });

  it('by status: groups in queue order; done and cancelled collapsed and with no tasks in the HTML', () => {
    const html = withFilters(undefined, 'status');
    const order = ['available', 'draft', 'done', 'cancelled'].map((g) => html.indexOf(`data-group="${g}"`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(attributeOf(html, '[data-group="available"][aria-expanded]', 'aria-expanded')).toBe('true');
    expect(attributeOf(html, '[data-group="done"][aria-expanded]', 'aria-expanded')).toBe('false');
    expect(attributeOf(html, '[data-group="cancelled"][aria-expanded]', 'aria-expanded')).toBe('false');
    expect(html).toContain('F8-01');
    expect(html).not.toContain('F1-01<');
    expect(hasElement(html, '.seg.on[data-view="status"]')).toBe(true);
  });

  it('by status with the saved list of open groups', () => {
    const html = withFilters(undefined, 'status', { [`${ID}\u0000status`]: ['done'] });
    expect(attributeOf(html, '[data-group="done"][aria-expanded]', 'aria-expanded')).toBe('true');
    expect(attributeOf(html, '[data-group="available"][aria-expanded]', 'aria-expanded')).toBe('false');
  });

  it('by status, the page of a group uses the key @group', () => {
    const many = Array.from({ length: 15 }, (_, i) => taskView(`F9-${String(i).padStart(2, '0')}`, 'available', { phase: 'p9' }));
    const large = plan({ phases: [phase({ dir: 'p9', title: 'Nove', done: 0, total: 15, pct: 0, tasks: many })], tasks: many });
    const html = render({ plans: [large], updated: '10:42', expanded: new Set([ID]), view: 'status' });
    expect(html).toContain('data-action="more"');
    expect(html).toContain('data-phase="@available"');
  });

  it('540 tasks with a search: the HTML stays bounded by the page size, not by the plan size', () => {
    const large = planView({ folder: ID, name: 'g', status: largePlan() }, new Date('2026-11-14T12:00:00Z'));
    const total = large.phases.reduce((n, f) => n + f.tasks.length, 0);
    for (const q of ['f', 'f1', 'f12', 'task f7', 'f7-1']) {
      const html = render({
        plans: [large],
        updated: '10:42',
        expanded: new Set([ID, large.id]),
        filters: { q, groups: [], track: '', tier: '' },
      });
      const rows = html.match(/<li class="ln /g)?.length ?? 0;
      expect(rows).toBeLessThanOrEqual(8 * (large.phases.length + 1));
      expect(rows).toBeLessThan(total);
    }
  });
});

describe('render — accessible tree', () => {
  const ID = '/ws/agent_plans/a';
  const f1 = phase({
    title: 'Fase um',
    dir: 'p1',
    done: 1,
    total: 2,
    pct: 50,
    tasks: [taskView('F1-01', 'done'), taskView('F1-02', 'in-progress', { depth: 1 })],
  });
  const f2 = phase({ title: 'Fase dois', dir: 'p2', done: 0, total: 1, pct: 0, tasks: [taskView('F2-01', 'blocked')] });
  const html = (view: 'phase' | 'status' = 'phase') =>
    render({
      plans: [plan({ phases: [f1, f2], tasks: [...f1.tasks, ...f2.tasks] })],
      updated: '10:42',
      expanded: new Set([ID]),
      openPhases: { [ID]: ['p1'] },
      view,
    });
  const ofPlan = (h: string) => h.slice(h.indexOf('role="tree"'));

  it('the phase list is a labeled tree, with groups and neutral rows', () => {
    const h = html();
    const tree = within(parseHtml(h)).getByRole('tree', { name: 'Fases e tasks' });
    expect(tree.className).toBe('body');
    expect(hasElement(h, 'ul.rows[role="group"]')).toBe(true);
    expect(hasElement(h, 'li[class="ln group-done"][role="none"]')).toBe(true);
    expect(hasElement(h, '[class="sec phase opened"][role="none"]')).toBe(true);
  });

  it('phase and task are treeitems with a level; the phase carries aria-expanded and the subtask one more level', () => {
    const h = ofPlan(html());
    const view = within(parseHtml(h));
    const phaseOne = view.getByRole('treeitem', { name: 'Fase um, 1 de 2 concluídas' });
    expect(phaseOne.className).toBe('sec-head');
    expect([phaseOne.getAttribute('aria-level'), phaseOne.getAttribute('aria-expanded')]).toEqual(['1', 'true']);
    expect(phaseOne.hasAttribute('tabindex')).toBe(true);
    expect(h).toMatch(/aria-expanded="false"/);
    const task = elementOf(h, '.ln-body[role="treeitem"][data-id="F1-01"]');
    expect([task.getAttribute('tabindex'), task.getAttribute('aria-level')]).toEqual(['-1', '2']);
    expect(attributeOf(h, '[role="treeitem"][data-id="F1-02"]', 'aria-level')).toBe('3');
  });

  it('only one tree item has tabindex 0: the first', () => {
    const h = ofPlan(html());
    const first = parseHtml(h).querySelectorAll('[role="treeitem"][tabindex="0"]');
    expect(first).toHaveLength(1);
    expect(h.indexOf('tabindex="0"')).toBeLessThan(h.indexOf('data-id="F1-01"'));
    expect(first[0]?.className).toBe('sec-head');
  });

  it('each tree has exactly one item with tabindex 0, its first header, on every tab and with the first phase filtered out', () => {
    const B = '/ws/agent_plans/b';
    const done = phase({ title: 'Feita', dir: 'q1', done: 1, total: 1, pct: 100, tasks: [taskView('F1-01', 'done')] });
    const plans = [
      plan({ phases: [f1, f2], tasks: [...f1.tasks, ...f2.tasks] }),
      plan({ id: B, name: 'b', phases: [done], tasks: done.tasks }),
    ];
    const ideas = {
      items: [
        { id: 'a', title: 'A', status: 'open' as const, questions: 0 },
        { id: 'b', title: 'B', status: 'ready' as const, questions: 0 },
      ],
      actions: [],
    };
    const base = { plans, updated: '10:42', expanded: new Set([ID, B]), ideas };
    const trees = (h: string): Element[] => [...parseHtml(h).querySelectorAll('[role="tree"]')];
    const focusable = (tree: Element): string[] =>
      [...tree.querySelectorAll('[tabindex="0"]')].map((el) => `${el.className}:${el === tree.querySelector('[role="treeitem"]')}`);
    const cases = {
      phase: render(base),
      status: render({ ...base, view: 'status' }),
      filtered: render({ ...base, filters: { q: 'F2-01', groups: [], track: '', tier: '' } }),
      now: render({ ...base, tab: 'now' }),
      ideas: render({ ...base, tab: 'ideas' }),
    };
    for (const [name, h] of Object.entries(cases)) {
      const all = trees(h);
      expect(all.length, name).toBeGreaterThan(0);
      for (const tree of all) expect(focusable(tree), name).toEqual(['sec-head:true']);
    }
    expect(trees(cases.phase)).toHaveLength(2);
  });

  it('the status of each task is also read as text: ID, title and status in the aria-label', () => {
    const h = ofPlan(html());
    expect(h).toContain('aria-label="F1-01 — F1-01, concluída"');
    expect(h).toContain('aria-label="F1-02 — F1-02, em andamento"');
  });

  it('the hover buttons are out of the Tab order (the detail covers them)', () => {
    const h = ofPlan(html());
    const outOfTab = (action: string): boolean =>
      [...parseHtml(h).querySelectorAll(`[data-action="${action}"]`)].every((b) => b.getAttribute('tabindex') === '-1');
    expect(hasElement(h, '[data-action="execute"]') && outOfTab('execute')).toBe(true);
    expect(hasElement(h, '[data-action="open"]') && outOfTab('open')).toBe(true);
  });

  it('the by-status view is also a tree: group at level 1 and task at 2', () => {
    const h = ofPlan(html('status'));
    const group = elementOf(h, '.sec-head[role="treeitem"][data-action="group"][tabindex="0"]');
    expect(group.getAttribute('aria-level')).toBe('1');
    expect(group.getAttribute('aria-label')).toMatch(/, 1 tasks$/);
    expect(attributeOf(h, '[role="treeitem"][data-id="F1-02"]', 'aria-level')).toBe('2');
  });
});

describe('render — common row and section', () => {
  const ID = '/ws/agent_plans/a';
  const completed = phase({
    title: 'Feita',
    dir: 'p0',
    done: 2,
    total: 2,
    pct: 100,
    tasks: [taskView('F0-01', 'done'), taskView('F0-02', 'done')],
  });
  const drafts = phase({
    title: 'Rascunhos',
    dir: 'p1',
    done: 0,
    total: 2,
    pct: 0,
    tasks: [taskView('F1-01', 'draft'), taskView('F1-02', 'draft')],
  });
  const mixed = phase({
    title: 'Mista',
    dir: 'p2',
    done: 1,
    total: 3,
    pct: 33,
    tasks: [taskView('F2-01', 'done'), taskView('F2-02', 'available', { tier: 'senior' }), taskView('F2-03', 'blocked')],
  });
  const phases = [completed, drafts, mixed];
  const html = (view: 'phase' | 'status' = 'phase') => {
    const h = render({
      plans: [plan({ phases, tasks: phases.flatMap((f) => f.tasks) })],
      updated: '10:42',
      expanded: new Set([ID]),
      openPhases: { [ID]: ['@done', 'p0', 'p1', 'p2'] },
      view,
    });
    return h.slice(h.indexOf('role="tree"'));
  };
  /** The section header with the given `data-phase`, up to the end of the button. */
  const phaseHeader = (h: string, dir: string) => {
    const middle = h.indexOf(`data-phase="${dir}"`);
    return h.slice(h.lastIndexOf('<button', middle), h.indexOf('</button>', middle));
  };
  /** The row (`<li>`) of the task with the given ID. */
  const rowOf = (h: string, id: string) => {
    const finished = h.indexOf(`data-id="${id}"`);
    const start = h.lastIndexOf('<li class="ln', finished);
    return h.slice(start, h.indexOf('</li>', finished) + 5);
  };

  it('the phase icon: ✓ done, dashed only with drafts, ring for the rest', () => {
    const h = html();
    // The completed one lives in the «Fases concluídas» block: the ✓ belongs to the block and the phase inside has no icon.
    expect(phaseHeader(h, '@done')).toContain('<span class="sec-ic status-done"><svg');
    expect(phaseHeader(h, '@done')).toContain('ic-status status-done');
    expect(phaseHeader(h, 'p0')).not.toContain('sec-ic');
    expect(phaseHeader(h, 'p1')).toContain('ic-status status-draft');
    expect(phaseHeader(h, 'p1')).not.toContain('class="ring"');
    expect(phaseHeader(h, 'p2')).toContain('class="ring"');
    expect(phaseHeader(h, 'p2')).not.toContain('ic-status');
  });

  it('in the by-status view the group header has the icon and a counter in the status color; the rows have no icon', () => {
    const h = html('status');
    expect(h).toMatch(
      /data-group="available"[^>]*>[\s\S]*?<span class="sec-ic status-available"><svg[^>]*ic-status status-available[\s\S]*?<span class="sec-num pc status-available">1<\/span>/,
    );
    const l = rowOf(h, 'F2-02');
    expect(l).toContain('no-ic');
    expect(l).not.toContain('ic-status');
  });

  it('in a phase with tasks in different statuses the rows have an icon', () => {
    const h = html();
    expect(rowOf(h, 'F2-01')).toContain('ic-status status-done');
    expect(rowOf(h, 'F2-02')).toContain('ic-status status-available');
    expect(rowOf(h, 'F2-02')).not.toContain('no-ic');
  });

  it('the main ▶ action comes after the hover buttons', () => {
    const l = rowOf(html(), 'F2-02');
    const run = l.indexOf('data-action="execute"');
    expect(run).toBeGreaterThan(-1);
    expect(run).toBeGreaterThan(l.indexOf('data-action="open"'));
    expect(run).toBeGreaterThan(l.lastIndexOf('data-action="detail"'));
    expect(l).toMatch(/<span class="acts"[^>]*><span class="hov">[\s\S]*<\/span><button[^>]*data-action="execute"/);
  });

  it('no row carries the tier as a tag; it goes into the row title', () => {
    const h = html();
    expect(h).not.toContain('<span class="tag">');
    expect(attributeOf(rowOf(h, 'F2-02'), '.ln-body', 'title')).toBe('F2-02 · Tier: senior');
  });
});

describe('render — the same search bar on the three tabs', () => {
  type Extra = RenderInput['tabBar'];
  const tasks = [
    taskView('F0-01', 'in-progress', { title: 'Andando' }),
    taskView('F0-03', 'owner', { title: 'Do dono' }),
    taskView('F0-04', 'available', { title: 'Livre' }),
  ];
  const ideas = {
    items: [
      { id: 'painel-novo.md', title: 'Painel novo', status: 'open' as const, questions: 0 },
      { id: 'outra.md', title: 'Outra coisa', status: 'mapped' as const, questions: null, plan: 'p' },
    ],
    actions: [],
  };
  const draw = (
    tab: 'now' | 'plans' | 'ideas',
    extra: Extra = {},
    opts: { filters?: RenderInput['filters']; view?: 'phase' | 'status'; plans?: PlanView[] } = {},
  ): string =>
    render({
      plans: opts.plans ?? [plan({ tasks })],
      updated: '10:42',
      ideas,
      tab,
      filters: opts.filters,
      view: opts.view,
      tabBar: extra,
    });
  const panel = (html: string): string => html.slice(html.indexOf('role="tabpanel"'));
  const filterBar = (html: string): string => /<div class="filters">.*?<\/div><\/div>/s.exec(html)?.[0] ?? '';
  const funnel = (html: string): string => parseHtml(html).querySelector('button.ib.funnel')?.outerHTML ?? '';
  const placeholder = (html: string): string | null => attributeOf(html, '.filters [data-field="q"]', 'placeholder');

  it('the bar appears on the three tabs, with the placeholder of the tab', () => {
    expect(placeholder(draw('now'))).toBe('Buscar no que pede atenção');
    expect(placeholder(draw('plans'))).toBe('Buscar por ID, título, trilha ou tipo');
    expect(placeholder(draw('ideas'))).toBe('Buscar ideias por nome ou título');
  });

  it('Now has chips by group, and a chip filters the groups', () => {
    const plain = draw('now');
    const [inProgressClass, pressed, , count] = chipOf(plain, '.chip[data-group="in-progress"]');
    expect([inProgressClass, pressed, count]).toEqual(['chip status-in-progress', 'false', '1']);
    expect(chipOf(plain, '.chip[data-group="owner"]')[0]).toBe('chip status-owner');
    expect(chipOf(plain, '.chip[data-group="available"]')[0]).toBe('chip status-available');
    const html = draw('now', { now: { q: '', groups: ['owner'], plan: '' } });
    expect(chipOf(html, '.chip[data-group="owner"]').slice(0, 2)).toEqual(['chip status-owner on', 'true']);
    expect(panel(html)).toContain('F0-03');
    expect(panel(html)).not.toContain('>F0-01<');
    expect(panel(html)).not.toContain('>F0-04<');
    expect(textOf(html, 'span.nm[data-announce]')).toBe('1 de 3');
  });

  it('the Now search with no result says nothing was found', () => {
    const html = draw('now', { now: { q: 'zzz', groups: [], plan: '' } });
    expect(html).toContain('Nada com esses filtros.');
    expect(html).not.toContain('class="now');
  });

  it('the Ideas search filters and highlights the term; the chips are by idea status', () => {
    const plain = draw('ideas');
    expect(chipOf(plain, '[data-action="chip"][data-status="open"]')).toEqual(['chip idea-color-open', 'false', 'aberta', '1']);
    expect(plain).toMatch(/data-status="mapped"/);
    const html = draw('ideas', { ideas: { q: 'painel', states: [] } });
    expect(html).toContain('<mark>Painel</mark> novo');
    expect(panel(html)).not.toContain('Outra coisa');
    const byState = draw('ideas', { ideas: { q: '', states: ['mapped'] } });
    expect(panel(byState)).toContain('Outra coisa');
    expect(panel(byState)).not.toContain('Painel novo');
    expect(draw('ideas', { ideas: { q: 'zzz', states: [] } })).toContain('Nenhuma ideia com esses filtros.');
  });

  it('each tab shows its own search', () => {
    const extra: Extra = { now: { q: 'owner', groups: [], plan: '' }, ideas: { q: 'painel', states: [] } };
    const filters = { q: 'f0', groups: [], track: '', tier: '' };
    expect(filterBar(draw('now', extra, { filters }))).toContain('value="owner"');
    expect(filterBar(draw('plans', extra, { filters }))).toContain('value="f0"');
    expect(filterBar(draw('ideas', extra, { filters }))).toContain('value="painel"');
  });

  it('the advanced part collapses behind the funnel; open, it brings track, tier and grouping', () => {
    const closed = draw('plans');
    const advanced = elementOf(funnel(closed), '[data-action="advanced"]');
    expect([advanced.getAttribute('aria-expanded'), advanced.getAttribute('aria-label')]).toEqual(['false', 'Mais filtros']);
    expect(closed).not.toContain('data-field="track"');
    expect(closed).not.toContain('data-view="status"');
    const isOpen = draw('plans', { advanced: true });
    expect(funnel(isOpen)).toContain('aria-expanded="true"');
    expect(hasElement(isOpen, '.advanced#filters-advanced')).toBe(true);
    expect(isOpen).toContain('data-field="track"');
    expect(isOpen).toContain('data-field="tier"');
    expect(hasElement(isOpen, '.seg.on[data-view="phase"]')).toBe(true);
  });

  it('the funnel dot appears with track, tier or «Por estado» in effect', () => {
    expect(funnel(draw('plans'))).not.toContain('class="dot"');
    expect(funnel(draw('plans', {}, { filters: { q: '', groups: [], track: 'panel', tier: '' } }))).toContain('class="dot"');
    expect(funnel(draw('plans', {}, { filters: { q: '', groups: [], track: '', tier: 'mid' } }))).toContain('class="dot"');
    expect(funnel(draw('plans', {}, { view: 'status' }))).toContain('class="dot"');
    expect(funnel(draw('plans', {}, { view: 'status' }))).toContain('aria-label="Mais filtros (algum está valendo)"');
    // The search and the chips stay in view: they do not light the dot.
    expect(funnel(draw('plans', {}, { filters: { q: 'x', groups: ['done'], track: '', tier: '' } }))).not.toContain('class="dot"');
  });

  it('in Now the advanced part is the plan, and only with more than one plan; Ideas has none', () => {
    expect(funnel(draw('now'))).toBe('');
    const two = [plan({ tasks }), plan({ id: '/ws/agent_plans/b', name: 'b', tasks: [taskView('F1-01', 'available')] })];
    expect(funnel(draw('now', {}, { plans: two }))).not.toContain('class="dot"');
    const isOpen = draw('now', { advanced: true }, { plans: two });
    expect(textOf(isOpen, 'select.sel[data-field="plan"] option[value="/ws/agent_plans/b"]')).toBe('b');
    const onlyB = draw('now', { now: { q: '', groups: [], plan: '/ws/agent_plans/b' } }, { plans: two });
    expect(funnel(onlyB)).toContain('class="dot"');
    expect(panel(onlyB)).toContain('F1-01');
    expect(panel(onlyB)).not.toContain('F0-03');
    expect(funnel(draw('ideas'))).toBe('');
  });

  it('with a filter in effect, «n de m» and «limpar» appear on any tab', () => {
    expect(textOf(draw('ideas', { ideas: { q: 'painel', states: [] } }), 'span.nm[data-announce]')).toBe('1 de 2');
    expect(draw('ideas')).not.toContain('class="nm"');
  });

  it('the search term does not inject HTML in Now or in Ideas', () => {
    expect(draw('now', { now: { q: '<b>', groups: [], plan: '' } })).toContain('value="&lt;b&gt;"');
    expect(draw('ideas', { ideas: { q: '"x', states: [] } })).toContain('value="&quot;x"');
  });
});

describe('cancel and give up in the panel', () => {
  const ID = '/ws/agent_plans/a';
  // Phase 1: one done and one cancelled, replaced by it. Phase 2: the give-up root and a draft that fell with it,
  // and an available one. Phase 3: only abandoned, one that fell with the root of phase 2 (the give-up crosses phases).
  const t1 = [
    taskView('F1-01', 'done', { phase: 'p1', file: 'p1/F1-01.md' }),
    taskView('F1-02', 'cancelled', { phase: 'p1', file: 'p1/F1-02.md', replacement: 'F2-03' }),
  ];
  const t2 = [
    taskView('F2-01', 'abandoned', { phase: 'p2', file: 'p2/F2-01.md', ownerGiveUp: true }),
    taskView('F2-02', 'abandoned', { phase: 'p2', file: 'p2/F2-02.md', giveUpRoot: 'F2-01' }),
    taskView('F2-03', 'available', { phase: 'p2', file: 'p2/F2-03.md' }),
  ];
  const t3 = [taskView('F3-01', 'abandoned', { phase: 'p3', file: 'p3/F3-01.md', giveUpRoot: 'F2-01' })];
  const p = (): PlanView =>
    plan({
      phases: [
        phase({ dir: 'p1', title: 'Um', done: 1, total: 1, pct: 100, tasks: t1 }),
        phase({ dir: 'p2', title: 'Dois', done: 0, total: 1, pct: 0, tasks: t2 }),
        phase({ dir: 'p3', title: 'Três', done: 0, total: 0, pct: 0, tasks: t3, abandoned: true }),
      ],
      tasks: [...t1, ...t2, ...t3],
    });
  const draw = (o: { opened?: string[]; filters?: RenderInput['filters']; view?: 'phase' | 'status' } = {}) =>
    render({
      plans: [p()],
      updated: '10:42',
      expanded: new Set([ID]),
      openPhases: o.opened ? { [ID]: o.opened, [`${ID}\u0000status`]: ['cancelled', 'abandoned'] } : {},
      filters: o.filters,
      view: o.view,
    });
  const body = (html: string) => html.slice(html.indexOf('role="tree"'));
  const abandonedBlock = (html: string) => html.slice(html.indexOf('data-phase="@abandoned"'));

  it('the cancelled task with a replacement shows «→ <ID>», which leads to the replacement row', () => {
    const html = body(draw({ opened: ['@done', 'p1'] }));
    expect(textOf(html, 'button.link[data-action="go"][data-plan="/ws/agent_plans/a"][data-id="F2-03"]')).toBe('→ F2-03');
    expect(html).toContain('title="substituída por F2-03"');
  });

  it('the abandoned task shows the give-up root, clickable; the root says the owner gave up', () => {
    const html = body(draw({ opened: ['p2'] }));
    const root = elementOf(html, 'button.link[data-action="go"][data-plan="/ws/agent_plans/a"][data-id="F2-01"]');
    expect(root.textContent).toBe('F2-01');
    expect(root.previousSibling?.textContent).toMatch(/abandonada com $/);
    expect(html).toMatch(/<div class="sub"[^>]*>o dono desistiu<\/div>/);
  });

  it('the phase with only abandoned tasks carries the abandoned mark, not the done one or the ring, and goes to the abandoned block', () => {
    const closed = body(draw());
    // A block of its own, collapsed, after the completed one; the phase does not appear outside it.
    expect(closed).toMatch(/data-phase="@done"[\s\S]*data-phase="@abandoned"/);
    expect(closed).toMatch(/class="sec abandoned-block group-abandoned"/);
    expect(closed).toContain('Fases abandonadas');
    expect(closed).not.toContain('data-phase="p3"');
    const isOpen = abandonedBlock(body(draw({ opened: ['@abandoned'] })));
    expect(isOpen).toMatch(/class="sec phase abandoned"/);
    expect(isOpen).toContain('aria-label="Três, fase abandonada"');
    expect(isOpen).toContain('<span class="sec-num">abandonada</span>');
    expect(isOpen).not.toContain('0/0');
  });

  it('with a filter, the abandoned phase returns to the list with the icon and the abandoned text', () => {
    const html = body(draw({ filters: { q: 'F3', groups: [], track: '', tier: '' } }));
    expect(html).toMatch(/class="sec phase abandoned opened"[\s\S]*<span class="sec-ic status-abandoned"><svg[^>]*status-abandoned/);
    expect(html).not.toContain('class="ring"');
  });

  it('the phase ring and counters do not count the abandoned tasks', () => {
    const html = body(draw({ opened: ['p2'] }));
    const two = html.slice(html.indexOf('data-phase="p2"'));
    expect(two).toMatch(/^[^]*?<span class="sec-num">0\/1<\/span>/);
    expect(two.slice(0, two.indexOf('</button>'))).not.toContain('status-abandoned"');
  });

  it('«abandonadas» chip in the bar; selected, only the abandoned ones pass', () => {
    const without = draw();
    expect(chipOf(without, '[data-action="chip"][data-group="abandoned"]')).toEqual(['chip status-abandoned', 'false', 'abandonadas', '3']);
    const so = body(draw({ filters: { q: '', groups: ['abandoned'], track: '', tier: '' } }));
    for (const id of ['F2-01', 'F2-02', 'F3-01']) expect(so).toContain(`data-id="${id}"`);
    for (const id of ['F1-01', 'F1-02', 'F2-03']) expect(so).not.toContain(`data-id="${id}"`);
  });

  it('by status: the abandoned group comes after the cancelled ones and stays collapsed by default', () => {
    const html = body(draw({ view: 'status' }));
    expect(html.indexOf('data-group="cancelled"')).toBeLessThan(html.indexOf('data-group="abandoned"'));
    expect(attributeOf(html, '[data-group="abandoned"][aria-expanded]', 'aria-expanded')).toBe('false');
    const isOpen = body(draw({ view: 'status', opened: [] }));
    expect(attributeOf(isOpen, '[data-group="abandoned"][aria-expanded]', 'aria-expanded')).toBe('true');
    expect(isOpen).toContain('o dono desistiu');
  });

  it('the abandoned tasks do not enter the stacked bar, the legend or the Now counter', () => {
    const html = render({ plans: [p()], updated: '10:42' });
    expect(html).not.toContain('<i class="status-abandoned">');
    expect(html).toMatch(/id="tab-now"[^>]*>[^]*?<span class="counter">1<\/span>/);
  });

  it('the detail: abandoned pill, the replacement and the give-up root clickable', () => {
    const x = stringsFor('pt-BR');
    const cancelled = taskDetail(p(), 'F1-02', x);
    expect(cancelled).toContain('Substituída por');
    expect(hasElement(cancelled, '[class="dep"][data-action="detail"][data-plan="/ws/agent_plans/a"][data-id="F2-03"]')).toBe(true);
    const child = taskDetail(p(), 'F3-01', x);
    expect(child).toContain('<i class="status-abandoned"></i>abandonada');
    expect(child).toContain('Abandonada com');
    expect(hasElement(child, '[class="dep"][data-action="detail"][data-plan="/ws/agent_plans/a"][data-id="F2-01"]')).toBe(true);
    expect(taskDetail(p(), 'F2-01', x)).toContain('o dono desistiu');
    expect(taskDetail(p(), 'F2-03', x)).not.toContain('Substituída por');
  });
});

describe('pathToTask', () => {
  const t1 = [taskView('F1-01', 'done', { phase: 'p1' })];
  const t2 = Array.from({ length: 10 }, (_, i) =>
    taskView(`F2-${String(i + 1).padStart(2, '0')}`, 'available', { phase: 'p2', track: i === 0 ? 'ci' : 'panel' }),
  );
  const t3 = [taskView('F3-01', 'abandoned', { phase: 'p3' })];
  const p = plan({
    phases: [
      phase({ dir: 'p1', title: 'Um', done: 1, total: 1, pct: 100, tasks: t1 }),
      phase({ dir: 'p2', title: 'Dois', done: 0, total: 10, pct: 0, tasks: t2 }),
      phase({ dir: 'p3', title: 'Três', done: 0, total: 0, pct: 0, tasks: t3, abandoned: true }),
    ],
    tasks: [...t1, ...t2, ...t3],
  });
  const empty = { q: '', groups: [], track: '', tier: '' };

  it('by phase: the phase, the done or abandoned block, and the position in the list', () => {
    expect(pathToTask(p, 'F1-01', 'phase', empty)).toEqual({
      openKeys: p.id,
      openItem: ['p1', '@done'],
      pageKey: pageKey(p.id, 'p1'),
      position: 0,
    });
    expect(pathToTask(p, 'F3-01', 'phase', empty)?.openItem).toEqual(['p3', '@abandoned']);
    expect(pathToTask(p, 'F2-10', 'phase', empty)?.position).toBe(9);
  });

  it('by status: the group; with a filter, the position among those that pass; hidden or nonexistent, nothing', () => {
    expect(pathToTask(p, 'F3-01', 'status', empty)).toEqual({
      openKeys: `${p.id}\u0000status`,
      openItem: ['abandoned'],
      pageKey: pageKey(p.id, '@abandoned'),
      position: 0,
    });
    expect(pathToTask(p, 'F2-10', 'phase', { ...empty, track: 'panel' })?.position).toBe(8);
    expect(pathToTask(p, 'F1-01', 'phase', { ...empty, groups: ['abandoned'] })).toBeUndefined();
    expect(pathToTask(p, 'F9-99', 'phase', empty)).toBeUndefined();
  });
});

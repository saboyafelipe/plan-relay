// @vitest-environment happy-dom
// Keyboard reach and announcements of the panel: every row action can be reached from the tree item without a
// pointer, the tree stays a single Tab stop, and the live region outlives the redraw.
import { within } from '@testing-library/dom';
import { ideasView } from './view';
import type { IdeaInput } from './input';
import { mountPanel, type MountedPanel } from './testing/panel-dom';

const PID = '/ws/agent_plans/a';
const view = (p: MountedPanel) => within(p.root);

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

const TASKS = [
  task('F1-01'),
  task('F1-02', { group: 'abandoned', ownerGiveUp: true }),
  task('F1-03', { group: 'cancelled', replacement: 'F1-01' }),
  task('F1-04', { group: 'abandoned', giveUpRoot: 'F1-02' }),
];
const STATUS = {
  type: 'status',
  updated: '10:42',
  plans: [
    {
      id: PID,
      name: 'a',
      pct: 0,
      done: 0,
      total: TASKS.length,
      phases: [
        {
          title: 'phase-0',
          dir: 'phase-0',
          done: 0,
          total: TASKS.length,
          pct: 0,
          inProgress: 0,
          abandoned: false,
          counts: {},
          tasks: TASKS,
        },
      ],
      tasks: TASKS,
      parallel: [],
    },
  ],
};

function idea(slug: string, status: IdeaInput['status'], over: Partial<IdeaInput> = {}): IdeaInput {
  return { file: `/ws/agent_plans/_ideas/${slug}.md`, slug, title: `Idea ${slug}`, status, openQuestions: 0, plan: null, ...over };
}
const IDEAS = ideasView(
  [idea('o', 'open', { openQuestions: 2 }), idea('r', 'ready'), idea('m', 'mapped', { plan: 'agent_plans/a/' })],
  ['refine', 'map', 'open', 'new', 'folder'],
);
const IDEA = (slug: string) => `/ws/agent_plans/_ideas/${slug}.md`;

/** Plans with the card and the phase open: every row is drawn. */
const mountPlans = () => mountPanel({ expanded: [PID], last: STATUS, openPhases: { [PID]: ['phase-0'] } });
/** Ideas with every section open, Mapped included. */
const mountIdeas = () =>
  mountPanel({ tab: 'ideas', last: { ...STATUS, ideas: IDEAS }, openPhases: { '\u0000ideas': ['open', 'ready', 'mapped'] } });

/**
 * Activates the tree item as the keyboard does: focus on it, then Enter, which a `<button>` turns into a click (the
 * browser does that, happy-dom does not). Gives the dialog that opened.
 */
function activate(p: MountedPanel, item: HTMLElement): HTMLDialogElement {
  item.focus();
  p.click(item);
  return view(p).getByRole<HTMLDialogElement>('dialog');
}

const taskItem = (p: MountedPanel, id: string) => p.control({ action: 'detail', plan: PID, id });
const ideaItem = (p: MountedPanel, slug: string) =>
  view(p)
    .getAllByRole('treeitem')
    .find((i) => i.getAttribute('data-idea') === IDEA(slug)) as HTMLElement;

/** The elements Tab stops on inside `scope`: focusable, not disabled, and without a negative `tabindex`. */
function tabStops(scope: Element): Element[] {
  return [...scope.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')].filter(
    (e) => !(e as HTMLButtonElement).disabled && Number(e.getAttribute('tabindex') ?? 0) >= 0,
  );
}

describe('task actions by keyboard', () => {
  it('«Desistir» is in the detail opened from the tree item of a ready task', () => {
    const p = mountPlans();
    const dialog = activate(p, taskItem(p, 'F1-01'));
    within(dialog).getByRole('button', { name: 'Desistir' }).click();
    expect(p.sent.at(-1)).toEqual({ type: 'giveUp', plan: PID, id: 'F1-01' });
  });

  it('«Reabrir» is in the detail of the root of a give-up, and only there', () => {
    const p = mountPlans();
    let dialog = activate(p, taskItem(p, 'F1-04'));
    expect(within(dialog).queryByRole('button', { name: 'Reabrir' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Desistir' })).toBeNull();
    p.key('Escape', {}, dialog);
    dialog = activate(p, taskItem(p, 'F1-02'));
    within(dialog).getByRole('button', { name: 'Reabrir' }).click();
    expect(p.sent.at(-1)).toEqual({ type: 'reopen', plan: PID, id: 'F1-02' });
  });

  it('the tree of a plan is one Tab stop, the «→ replacement» and «abandoned with» links included', () => {
    const p = mountPlans();
    const tree = p.root.querySelector('[role="tree"]') as Element;
    expect(tree.querySelector('[data-action="go"]')).not.toBeNull();
    expect(tabStops(tree)).toHaveLength(1);
  });
});

/** The buttons inside `tree` that a screen reader still reaches and that are not tree items. */
function exposedNonItems(tree: Element): Element[] {
  return [...tree.querySelectorAll('button')].filter((b) => b.getAttribute('role') !== 'treeitem' && !b.closest('[aria-hidden="true"]'));
}

describe('the tree owns only tree items and groups', () => {
  it('in Plans, the row actions and the subline links are hidden, and the subline describes the tree item', () => {
    const p = mountPlans();
    const tree = p.root.querySelector('[role="tree"]') as Element;
    expect(tree.querySelector('[data-action="go"]')).not.toBeNull();
    expect(exposedNonItems(tree)).toEqual([]);
    expect(view(p).getByRole('treeitem', { name: /^F1-03/, description: '→ F1-01' })).toBeTruthy();
  });

  it('in Ideas, the row actions are hidden, and the open questions describe the tree item', () => {
    const p = mountIdeas();
    const tree = p.root.querySelector('[role="tree"]') as Element;
    expect(exposedNonItems(tree)).toEqual([]);
    expect(ideaItem(p, 'o').getAttribute('aria-describedby')).not.toBeNull();
    expect(view(p).getByRole('treeitem', { name: /^Idea m/, description: '→ a' })).toBeTruthy();
  });
});

describe('state that is not only colour or a tooltip', () => {
  it('the Now tab says in its name how many tasks wait on you', () => {
    const owner = [task('F2-01', { group: 'owner', type: 'decision' })];
    const plan = { ...STATUS.plans[0], tasks: owner, total: 1, phases: [{ ...STATUS.plans[0]?.phases[0], tasks: owner, total: 1 }] };
    const p = mountPanel({ tab: 'now', last: { ...STATUS, plans: [plan] } });
    expect(view(p).getByRole('tab', { name: /1 esperando por você/ })).toBeTruthy();
  });

  it('a dependency still missing says so in its name, not only in its colour and title', () => {
    const tasks = [task('F1-01'), task('F1-05', { blockedBy: ['F1-01'], waitingOn: ['F1-01'], group: 'blocked' })];
    const plan = { ...STATUS.plans[0], tasks, phases: [{ ...STATUS.plans[0]?.phases[0], tasks }] };
    const p = mountPanel({ expanded: [PID], last: { ...STATUS, plans: [plan] }, openPhases: { [PID]: ['phase-0'] } });
    const dialog = activate(p, taskItem(p, 'F1-05'));
    expect(within(dialog).getByRole('button', { name: /F1-01.*falta/ })).toBeTruthy();
  });
});

describe('idea actions by keyboard', () => {
  it('the tree item of an open idea opens its detail, with «Afinar» and «Criar tasks»', () => {
    const p = mountIdeas();
    let dialog = activate(p, ideaItem(p, 'o'));
    expect(dialog.getAttribute('aria-labelledby')).not.toBeNull();
    expect(view(p).getByRole('dialog', { name: 'Idea o' })).toBe(dialog);
    // Esc closes it and focus returns to the row it opened from.
    p.key('Escape', {}, dialog);
    expect(view(p).queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(ideaItem(p, 'o'));
    // An action goes to the host and the popup gets out of the way of what it opens.
    dialog = activate(p, ideaItem(p, 'o'));
    within(dialog)
      .getByRole('button', { name: /Afinar/ })
      .click();
    expect(p.sent.at(-1)).toEqual({ type: 'ideaRefine', idea: IDEA('o') });
    expect(view(p).queryByRole('dialog')).toBeNull();
    dialog = activate(p, ideaItem(p, 'o'));
    within(dialog)
      .getByRole('button', { name: /Criar tasks/ })
      .click();
    expect(p.sent.at(-1)).toEqual({ type: 'ideaMap', idea: IDEA('o') });
  });

  it('the detail of a ready idea also refines and maps; «Abrir» opens the file', () => {
    const p = mountIdeas();
    const dialog = activate(p, ideaItem(p, 'r'));
    expect(within(dialog).getByRole('button', { name: /Afinar/ })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /Criar tasks/ })).toBeTruthy();
    within(dialog).getByRole('button', { name: /Abrir/ }).click();
    expect(p.sent.at(-1)).toEqual({ type: 'ideaOpen', idea: IDEA('r') });
    expect(view(p).queryByRole('dialog')).toBeNull();
  });

  it('the detail of a mapped idea has the plan link and no Afinar or Criar tasks', () => {
    const p = mountIdeas();
    const dialog = activate(p, ideaItem(p, 'm'));
    expect(within(dialog).queryByRole('button', { name: /Afinar/ })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /Criar tasks/ })).toBeNull();
    within(dialog).getByRole('button', { name: '→ a' }).click();
    expect(view(p).queryByRole('dialog')).toBeNull();
    expect(p.savedList.at(-1)?.tab).toBe('plans');
  });

  it('the ideas tree is one Tab stop, the «→ plan» link of the mapped idea included', () => {
    const p = mountIdeas();
    const tree = p.root.querySelector('[role="tree"]') as Element;
    expect(tree.querySelector('[data-action="idea-plan"]')).not.toBeNull();
    expect(tabStops(tree)).toHaveLength(1);
  });

  it('an idea whose file is gone from the read closes its detail', () => {
    const p = mountIdeas();
    activate(p, ideaItem(p, 'o'));
    p.receive({ ...STATUS, updated: '10:43', ideas: { ...IDEAS, items: IDEAS.items.filter((i) => i.id !== IDEA('o')) } });
    expect(view(p).queryByRole('dialog')).toBeNull();
  });
});

describe('the live region', () => {
  it('is one node that outlives the redraw and says each host notice once', () => {
    const p = mountPlans();
    const live = view(p).getByRole('status');
    p.receive({ type: 'notices', notices: ['old extension'] });
    expect(view(p).getByRole('status')).toBe(live);
    expect(live.textContent).toBe('old extension');
    // A redraw that changes nothing it announces leaves nothing to say again.
    p.receive({ ...STATUS, updated: '10:43' });
    expect(view(p).getAllByRole('status')).toEqual([live]);
    expect(live.textContent).toBe('');
  });

  it('says the plugin line when it changes: «installing», then the install error', () => {
    const p = mountPlans();
    const live = view(p).getByRole('status');
    p.receive({ type: 'plugin', plugin: { state: 'installing' } });
    expect(live.textContent).toBe('instalando o plugin…');
    p.receive({ type: 'plugin', plugin: { state: 'error', error: 'sem rede' } });
    expect(live.textContent).toBe('Plugin: erro — sem rede');
  });

  it('says the filter count «n of m» when it changes, from the same node', () => {
    const p = mountPlans();
    const live = view(p).getByRole('status');
    p.type('q', 'F1-01', 'change');
    expect(view(p).getAllByRole('status')).toEqual([live]);
    expect(live.textContent).toBe('1 de 4');
    p.type('q', 'F1-0', 'change');
    expect(live.textContent).toBe('4 de 4');
  });
});

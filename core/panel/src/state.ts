// The panel state and its transitions: plain data in, new plain data out, no DOM. The page keeps the current state,
// draws it and saves the part that outlives the view.
import type { Strings } from '@plan-relay/i18n';
import type { EnvironmentInput, HostMessage, PluginView, StatusMessage } from './messages';
import type { TaskGroup } from './input';
import { EMPTY_FILTERS, EMPTY_IDEAS_FILTERS, EMPTY_NOW_FILTERS, type IdeaState } from './filter';
import {
  IDEAS_KEY,
  PER_PAGE,
  groupsKey,
  ideaPlan,
  ideasSectionsByDefault,
  nowKey,
  nowSectionsByDefault,
  openGroupsByDefault,
  openPhasesByDefault,
  pageKey,
  pathToTask,
  type RenderInput,
  type Tab,
} from './render';
import { SAVED_VERSION, type FiltersByTab, type Saved, type TasksView } from './saved';

/** A task of a plan, by the `id` of the plan and of the task. */
export interface TaskRef {
  plan: string;
  id: string;
}

/** An idea, by its file. */
export interface IdeaRef {
  idea: string;
}

export interface PanelState {
  readonly expanded: readonly string[];
  readonly tab: Tab;
  readonly openPhases: Readonly<Record<string, readonly string[]>>;
  readonly filters: FiltersByTab;
  readonly advanced: boolean;
  readonly view: TasksView;
  readonly pages: Readonly<Record<string, number>>;
  readonly last?: StatusMessage | undefined;
  readonly plugin?: PluginView | undefined;
  readonly environment?: EnvironmentInput | undefined;
  readonly notices: readonly string[];
  /** The plan whose «⋯» menu is open; lives only in the page, is not saved. */
  readonly menuOpen?: string | undefined;
  /** A read is in progress; not saved — when the view reappears, the host says it again. */
  readonly loading: boolean;
  /** The task or the idea whose detail is open; lives only in the page, is not saved. */
  readonly detail?: TaskRef | IdeaRef | undefined;
}

/** The fields the search bar writes: the search of the active tab, track and tier of Plans, plan of Now. */
export type FieldName = 'q' | 'track' | 'tier' | 'plan';

export function isFieldName(x: unknown): x is FieldName {
  return x === 'q' || x === 'track' || x === 'tier' || x === 'plan';
}

export function fromSaved(saved: Saved): PanelState {
  const { expanded, tab, openPhases, filters, advanced, view, pages, last, plugin, environment, notices } = saved;
  return {
    expanded,
    tab,
    openPhases,
    filters,
    advanced,
    view,
    pages,
    last,
    plugin,
    environment,
    notices: notices ?? [],
    loading: false,
  };
}

/** What outlives the view: everything but the open menu, the open detail and the read in progress. */
export function toSaved(s: PanelState): Saved {
  return {
    version: SAVED_VERSION,
    expanded: [...s.expanded],
    tab: s.tab,
    openPhases: Object.fromEntries(Object.entries(s.openPhases).map(([k, v]) => [k, [...v]])),
    filters: s.filters,
    advanced: s.advanced,
    view: s.view,
    pages: { ...s.pages },
    last: s.last,
    plugin: s.plugin,
    environment: s.environment,
    notices: [...s.notices],
  };
}

/** What `render` draws for this state, or nothing before the first status. */
export function renderInput(s: PanelState, strings: Strings, actionsInRow: boolean): RenderInput | undefined {
  if (!s.last) return undefined;
  return {
    plans: s.last.plans,
    updated: s.last.updated,
    expanded: new Set(s.expanded),
    loading: s.loading,
    plugin: s.plugin,
    strings,
    environment: s.environment,
    ideas: s.last.ideas,
    notices: s.notices,
    tab: s.tab,
    menuOpen: s.menuOpen,
    openPhases: s.openPhases,
    pages: s.pages,
    detail: s.detail,
    filters: s.filters.plans,
    view: s.view,
    actionsInRow,
    tabBar: { now: s.filters.now, ideas: s.filters.ideas, advanced: s.advanced },
  };
}

function toggled<T>(list: readonly T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** A new status prunes what cited plans that no longer exist: open cards, phases, pages, the menu and the detail. */
function receiveStatus(s: PanelState, m: StatusMessage): PanelState {
  const ids = new Set(m.plans.map((p) => p.id));
  // The key of the open groups of the by-status view is `plan\0status`: the plan it cites applies.
  // The Ideas sections (`\0ideas`) cite no plan and stay.
  const openPhases = Object.fromEntries(
    Object.entries(s.openPhases).filter(([k]) => k === IDEAS_KEY || ids.has(k.split('\u0000')[0] ?? k)),
  );
  // The phase pages carry the plan in the key (`plan\0phase`); the other lists have no owner and stay.
  const pages = Object.fromEntries(
    Object.entries(s.pages).filter(([k]) => {
      const cut = k.indexOf('\u0000');
      return cut < 0 || ids.has(k.slice(0, cut));
    }),
  );
  const { detail } = s;
  let detailStays = false;
  if (detail && 'idea' in detail) detailStays = m.ideas?.items.some((i) => i.id === detail.idea) === true;
  else if (detail) detailStays = m.plans.find((p) => p.id === detail.plan)?.tasks.some((t) => t.id === detail.id) === true;
  return {
    ...s,
    last: m,
    expanded: s.expanded.filter((id) => ids.has(id)),
    openPhases,
    pages,
    menuOpen: s.menuOpen !== undefined && ids.has(s.menuOpen) ? s.menuOpen : undefined,
    detail: detailStays ? detail : undefined,
  };
}

/** The host messages that carry data: the status, the read in progress, the plugin, the environment and the notices. */
export function receive(s: PanelState, m: Exclude<HostMessage, { type: 'collapseAll' } | { type: 'filter' }>): PanelState {
  switch (m.type) {
    case 'status':
      return receiveStatus(s, m);
    case 'loading':
      return { ...s, loading: m.active };
    case 'plugin':
      return { ...s, plugin: m.plugin };
    case 'environment':
      return { ...s, environment: m.environment };
    case 'notices':
      return { ...s, notices: m.notices };
  }
}

/** Selects a tab. The advanced part belongs to each tab, so a new tab opens with it closed; the open menu closes. */
export function selectTab(s: PanelState, tab: Tab): PanelState {
  return { ...s, tab, advanced: tab === s.tab ? s.advanced : false, menuOpen: undefined };
}

/** «Collapse all»: closes the phases of every plan and selects Plans, where the effect shows. */
export function collapseAll(s: PanelState): PanelState {
  const openPhases = { ...s.openPhases };
  for (const plan of s.last?.plans ?? []) openPhases[plan.id] = [];
  return { ...selectTab(s, 'plans'), menuOpen: s.menuOpen, openPhases };
}

export function toggleCard(s: PanelState, plan: string): PanelState {
  return { ...s, expanded: toggled(s.expanded, plan) };
}

export function toggleMenu(s: PanelState, plan: string): PanelState {
  return { ...s, menuOpen: s.menuOpen === plan ? undefined : plan };
}

/** Toggles an item of an open-sections list; a list without a user choice yet starts from `fallback`. */
function toggleOpen(s: PanelState, key: string, item: string, fallback: readonly string[]): PanelState {
  return { ...s, openPhases: { ...s.openPhases, [key]: toggled(s.openPhases[key] ?? fallback, item) } };
}

export function togglePhase(s: PanelState, plan: string, phase: string): PanelState {
  const p = s.last?.plans.find((k) => k.id === plan);
  return toggleOpen(s, plan, phase, p ? openPhasesByDefault(p) : []);
}

/** A group of the by-status view. */
export function toggleGroup(s: PanelState, plan: string, group: TaskGroup): PanelState {
  return toggleOpen(s, groupsKey(plan), group, openGroupsByDefault());
}

/** A section of a plan in Now; they open by default. */
export function toggleNowSection(s: PanelState, plan: string, group: TaskGroup): PanelState {
  return toggleOpen(s, nowKey(plan), group, nowSectionsByDefault());
}

/** A section of Ideas; they open by default, except Mapped. */
export function toggleIdeasSection(s: PanelState, status: IdeaState): PanelState {
  return toggleOpen(s, IDEAS_KEY, status, ideasSectionsByDefault());
}

/** A status chip applies to the active tab: groups in Now and Plans, idea states in Ideas; elsewhere it changes nothing. */
export function toggleChip(s: PanelState, chip: { group: TaskGroup } | { status: IdeaState }): PanelState {
  const f = s.filters;
  if ('status' in chip)
    return s.tab === 'ideas' ? { ...s, filters: { ...f, ideas: { ...f.ideas, states: toggled(f.ideas.states, chip.status) } } } : s;
  if (s.tab === 'now') return { ...s, filters: { ...f, now: { ...f.now, groups: toggled(f.now.groups, chip.group) } } };
  if (s.tab === 'plans') return { ...s, filters: { ...f, plans: { ...f.plans, groups: toggled(f.plans.groups, chip.group) } } };
  return s;
}

export function toggleAdvanced(s: PanelState): PanelState {
  return { ...s, advanced: !s.advanced };
}

export function setView(s: PanelState, view: TasksView): PanelState {
  return { ...s, view };
}

/** «Clear» empties the filters of the active tab only: the filter of the others stays. */
export function clearFilters(s: PanelState): PanelState {
  const f = s.filters;
  if (s.tab === 'now') return { ...s, filters: { ...f, now: { ...EMPTY_NOW_FILTERS, groups: [] } } };
  if (s.tab === 'ideas') return { ...s, filters: { ...f, ideas: { ...EMPTY_IDEAS_FILTERS, states: [] } } };
  return { ...s, filters: { ...f, plans: { ...EMPTY_FILTERS, groups: [] } } };
}

/** «Show more» adds a page to the list. */
export function showMore(s: PanelState, plan: string, phase: string): PanelState {
  const key = pageKey(plan, phase);
  return { ...s, pages: { ...s.pages, [key]: Math.max(s.pages[key] ?? PER_PAGE, PER_PAGE) + PER_PAGE } };
}

/** A field of the bar: the search goes to the active tab, the plan selector to Now, track and tier to Plans. */
export function setField(s: PanelState, name: FieldName, value: string): PanelState {
  const f = s.filters;
  if (name === 'q') return { ...s, filters: { ...f, [s.tab]: { ...f[s.tab], q: value } } };
  if (name === 'plan') return { ...s, filters: { ...f, now: { ...f.now, plan: value } } };
  return { ...s, filters: { ...f, plans: { ...f.plans, [name]: value } } };
}

/**
 * Going to the row of a task: the detail closes, Plans is selected, the card opens, and so do the phase (and its block)
 * or the group and the list page up to the task (`row`). A task the filters hide opens in the detail instead (`detail`);
 * a task that is not in the plan changes nothing (`none`).
 */
export function goToTask(s: PanelState, task: TaskRef): { to: 'row' | 'detail' | 'none'; state: PanelState } {
  const p = s.last?.plans.find((k) => k.id === task.plan);
  const path = p ? pathToTask(p, task.id, s.view, s.filters.plans) : undefined;
  if (!p || !path)
    return p?.tasks.some((t) => t.id === task.id) ? { to: 'detail', state: { ...s, detail: task } } : { to: 'none', state: s };
  const fallback = s.view === 'status' ? openGroupsByDefault() : openPhasesByDefault(p);
  const open = [...new Set([...(s.openPhases[path.openKeys] ?? fallback), ...path.openItem])];
  const shown = Math.max(s.pages[path.pageKey] ?? PER_PAGE, PER_PAGE);
  const pages = path.position >= shown ? { ...s.pages, [path.pageKey]: Math.ceil((path.position + 1) / PER_PAGE) * PER_PAGE } : s.pages;
  const base = s.tab === 'plans' ? s : selectTab(s, 'plans');
  return {
    to: 'row',
    state: {
      ...base,
      menuOpen: s.menuOpen,
      detail: undefined,
      expanded: s.expanded.includes(p.id) ? s.expanded : [...s.expanded, p.id],
      openPhases: { ...s.openPhases, [path.openKeys]: open },
      pages,
    },
  };
}

/** The link of the mapped idea: Plans with the card of that plan open; a plan that was not read, only the tab. */
export function goToIdeaPlan(s: PanelState, plan: string): { id: string | undefined; state: PanelState } {
  const id = ideaPlan(s.last?.plans ?? [], plan);
  const expanded = id === undefined || s.expanded.includes(id) ? s.expanded : [...s.expanded, id];
  return { id, state: selectTab({ ...s, expanded }, 'plans') };
}

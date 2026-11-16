// The Plans tab: one card per plan, its phases (or its status groups) in an accordion, the progress bar and the path to a task row.
import type { Key, Strings } from '@plan-relay/i18n';
import type { TaskGroup } from './input';
import { countByState, filter, activeFilters, type Filters } from './filter';
import { ring, stackedBar, statusIcon, type SegmentColor } from './icons';
import type { PhaseView, TaskView, PlanView } from './view';
import { escapeHtml } from './util';
import {
  phaseDone,
  DONE_BLOCK,
  type Section,
  taskList,
  type Slice,
  ABANDONED_BLOCK,
  sections,
  pageKey,
  planMarks,
  planActions,
  chip,
  options,
  filterBar,
} from './render-shared';

/** The phases that open by themselves: the ones with an in-progress task or, with none, the first with an available or owner task. */
export function openPhasesByDefault(p: Pick<PlanView, 'phases'>): string[] {
  // A fully completed plan (abandoned phases do not count): the completed block is what matters and opens by itself.
  const alive = p.phases.filter((f) => !f.abandoned);
  if (alive.length > 0 && alive.every(phaseDone)) return [DONE_BLOCK];
  const running = p.phases.filter((f) => f.inProgress > 0 || f.tasks.some((t) => t.group === 'in-progress'));
  if (running.length) return running.map((f) => f.dir);
  const free = p.phases.find((f) => f.tasks.some((t) => t.group === 'available' || t.group === 'owner'));
  return free ? [free.dir] : [];
}

/** The colored counters of a phase, only for the statuses that ask for attention or have not started yet. */
const COUNTER_STATES: readonly Exclude<TaskGroup, 'done' | 'cancelled' | 'abandoned' | 'invalid'>[] = [
  'in-progress',
  'owner',
  'available',
  'blocked',
  'draft',
];

function ringColor(f: PhaseView): TaskGroup {
  if (f.abandoned) return 'abandoned';
  if (f.total > 0 && f.done === f.total) return 'done';
  if (f.inProgress > 0 || (f.counts['in-progress'] ?? 0) > 0) return 'in-progress';
  if (f.tasks.length > 0 && f.tasks.every((t) => t.group === 'draft')) return 'draft';
  return 'blocked';
}

/**
 * The phase icon: ✓ when completed, the × of the abandoned one, the draft dashes when it only has drafts and the progress
 * ring for the rest (the reader `done/total` already leaves out the cancelled and abandoned ones).
 */
function phaseIcon(f: PhaseView): string {
  const color = ringColor(f);
  if (color === 'done' || color === 'abandoned') return statusIcon(color);
  if (color === 'draft') return statusIcon('draft');
  return ring(f.total > 0 ? f.done / f.total : 0);
}

/** The statuses of the «By status» view, in work-queue order. */
export const STATE_ORDER: readonly TaskGroup[] = [
  'in-progress',
  'owner',
  'available',
  'blocked',
  'draft',
  'done',
  'cancelled',
  'abandoned',
  'invalid',
];

/** The `Saved.openPhases` key of the open groups of the by-status view of a plan (the phases use only the plan `id`). */
export function groupsKey(plan: string): string {
  return `${plan}\u0000status`;
}

/** The groups that open by themselves: all but done, cancelled and abandoned, which ask for no action. */
export function openGroupsByDefault(): TaskGroup[] {
  return STATE_ORDER.filter((g) => g !== 'done' && g !== 'cancelled' && g !== 'abandoned');
}

/** A group of the by-status view, in the same accordion as the phases; the `data-phase` of the pages carry `@` so they do not collide. */
function groupAccordion(
  plan: string,
  g: TaskGroup,
  tasks: readonly TaskView[],
  isOpen: boolean,
  pages: Readonly<Record<string, number>>,
  x: Strings,
  terms: readonly string[],
): Section {
  return {
    classes: [`group-${g}`, ...(g === 'done' ? ['done'] : [])],
    opened: isOpen,
    attributes: `aria-label="${escapeHtml(x.t('tree.group', x.t(`group.${g}`), tasks.length))}" data-action="group" data-plan="${escapeHtml(plan)}" data-group="${g}"`,
    icon: statusIcon(g),
    iconColor: `status-${g}`,
    title: escapeHtml(x.t(`group.${g}`)),
    num: String(tasks.length),
    color: `status-${g}`,
    body: () => taskList(plan, `@${g}`, tasks, pages, x, terms, true),
  };
}

/** A phase in an accordion: ring, title, counters per status and done/total; when open, it brings the tasks (when closed, none). */
function phaseAccordion(
  plan: string,
  f: PhaseView,
  tasks: readonly TaskView[],
  opened: boolean,
  pages: Readonly<Record<string, number>>,
  x: Strings,
  terms: readonly string[],
  inBlock = false,
): Section {
  const completed = phaseDone(f);
  const counters = COUNTER_STATES.filter((g) => (f.counts[g] ?? 0) > 0)
    .map((g) => `<span class="b status-${g}" title="${escapeHtml(x.t(`group.${g}`))}">${f.counts[g]}</span>`)
    .join('');
  // The abandoned phase has nothing to count (total 0): in place of «0/0», the text.
  const label = f.abandoned ? x.t('tree.abandonedPhase', f.title) : x.t('tree.phase', f.title, f.done, f.total);
  return {
    classes: ['phase', ...(completed ? ['done'] : []), ...(f.abandoned ? ['abandoned'] : [])],
    opened,
    attributes: `aria-label="${escapeHtml(label)}" data-action="phase" data-plan="${escapeHtml(plan)}" data-phase="${escapeHtml(f.dir)}"`,
    // In the completed block the group already says «completed»: the phases have no icon.
    icon: inBlock ? '' : phaseIcon(f),
    iconColor: `status-${ringColor(f)}`,
    title: escapeHtml(f.title),
    tooltipTitle: escapeHtml(f.title),
    badges: counters,
    num: f.abandoned ? escapeHtml(x.t('panel.abandonedPhase')) : `${f.done}/${f.total}`,
    body: () => taskList(plan, f.dir, tasks, pages, x, terms, false),
  };
}

/** The plan statuses in the stacked bar and in the legend, in order; cancelled, abandoned and invalid do not go in. */
const BAR_STATES: readonly { group: Exclude<TaskGroup, 'cancelled' | 'abandoned' | 'invalid'>; color: SegmentColor }[] = [
  { group: 'done', color: 'ok' },
  { group: 'in-progress', color: 'run' },
  { group: 'owner', color: 'owner' },
  { group: 'blocked', color: 'wait' },
  { group: 'draft', color: 'draft' },
  { group: 'available', color: 'free' },
];

/** The stacked bar (one segment per status with a task) and the legend: «40% · 2/5» and the count of each status. */
function planProgress(p: PlanView, x: Strings): string {
  const n = new Map<TaskGroup, number>();
  for (const t of p.tasks) n.set(t.group, (n.get(t.group) ?? 0) + 1);
  const present = BAR_STATES.filter((e) => (n.get(e.group) ?? 0) > 0);
  const legend = present
    .map((e) => `<span class="leg"><i class="status-${e.group}"></i>${n.get(e.group)} ${escapeHtml(x.t(`group.${e.group}`))}</span>`)
    .join('');
  const progress = `<span class="prog">${escapeHtml(x.t('panel.progress', p.pct, p.done, p.total))}</span>`;
  return `<div class="progress">${stackedBar(present.map((e) => ({ color: e.color, n: n.get(e.group) ?? 0 })))}<div class="legend">${progress}${legend}</div></div>`;
}

/** The phases of the plan; with a filter, only those with a result, all open (the user choice comes back when the filter is cleared). */
function planPhases(
  p: PlanView,
  opened: ReadonlySet<string>,
  pages: Readonly<Record<string, number>>,
  x: Strings,
  r: Slice,
): (Section | undefined)[] {
  const draw = (f: PhaseView, inBlock: boolean): Section | undefined => {
    const tasks = r.active ? filter(f.tasks, r.filters) : f.tasks;
    if (r.active && tasks.length === 0) return undefined;
    return phaseAccordion(p.id, f, tasks, r.active || opened.has(f.dir), pages, x, r.terms, inBlock);
  };
  // With a search or filter the block disappears: the phases with a result return to the list, all open.
  if (r.active) return p.phases.map((f) => draw(f, false));
  const completedPhases = p.phases.filter(phaseDone);
  // The abandoned ones in a block of their own, below the completed one: neither completed nor to do.
  const abandoned = p.phases.filter((f) => f.abandoned && !phaseDone(f));
  const ongoing = p.phases.filter((f) => !phaseDone(f) && !f.abandoned).map((f) => draw(f, false));
  const abandonedCount = abandoned.reduce((n, f) => n + f.tasks.length, 0);
  const abandonedBlock: Section | undefined =
    abandoned.length === 0
      ? undefined
      : {
          classes: ['abandoned-block', 'group-abandoned'],
          opened: opened.has(ABANDONED_BLOCK),
          attributes: `aria-label="${escapeHtml(x.t('tree.group', x.t('panel.abandonedPhases'), abandonedCount))}" data-action="phase" data-plan="${escapeHtml(p.id)}" data-phase="${ABANDONED_BLOCK}"`,
          icon: statusIcon('abandoned'),
          iconColor: 'status-abandoned',
          title: escapeHtml(x.t('panel.abandonedPhases')),
          num: escapeHtml(x.t('panel.nTasks', abandonedCount)),
          color: 'status-abandoned',
          body: () => sections(abandoned.map((f) => draw(f, true))),
        };
  if (completedPhases.length === 0) return [...ongoing, abandonedBlock];
  const total = completedPhases.reduce((n, f) => n + f.total, 0);
  const block: Section = {
    classes: ['done-block', 'group-done'],
    opened: opened.has(DONE_BLOCK),
    attributes: `aria-label="${escapeHtml(x.t('tree.group', x.t('panel.completedPhases'), total))}" data-action="phase" data-plan="${escapeHtml(p.id)}" data-phase="${DONE_BLOCK}"`,
    icon: statusIcon('done'),
    iconColor: 'status-done',
    title: escapeHtml(x.t('panel.completedPhases')),
    num: escapeHtml(x.t('panel.nTasks', total)),
    color: 'status-done',
    body: () => sections(completedPhases.map((f) => draw(f, true))),
  };
  return [...ongoing, block, abandonedBlock];
}

/** What to open for a task row to appear on the card: sections, under which key, and its list page. */
export interface TaskPath {
  /** The `Saved.openPhases` key: the plan `id` (by phase) or `groupsKey` (by status). */
  openKeys: string;
  /** The sections to open: the phase and the block it is in, or the group. */
  openItem: string[];
  /** The `Saved.pages` key of the task list. */
  pageKey: string;
  /** The position of the task in the list (0 is the first), with the filters in effect. */
  position: number;
}

/**
 * The path to the row of a task of the plan, in the view and with the given filters (the «→ <replacement ID>» link of the cancelled one and the root
 * of the abandoned one). `undefined` when the task does not exist or does not pass the filters: the row would have nowhere to appear.
 */
export function pathToTask(p: PlanView, id: string, view: 'phase' | 'status', filters: Filters): TaskPath | undefined {
  const t = p.tasks.find((k) => k.id === id);
  const active = activeFilters(filters);
  if (!t || (active && !filter([t], filters).length)) return undefined;
  const ofList = (tasks: readonly TaskView[]): number => (active ? filter(tasks, filters) : tasks).indexOf(t);
  if (view === 'status') {
    return {
      openKeys: groupsKey(p.id),
      openItem: [t.group],
      pageKey: pageKey(p.id, `@${t.group}`),
      position: ofList(p.tasks.filter((k) => k.group === t.group)),
    };
  }
  const f = p.phases.find((k) => k.dir === t.phase);
  const openItem = [t.phase];
  if (f && !active && phaseDone(f)) openItem.push(DONE_BLOCK);
  else if (f && !active && f.abandoned) openItem.push(ABANDONED_BLOCK);
  return { openKeys: p.id, openItem, pageKey: pageKey(p.id, t.phase), position: f ? ofList(f.tasks) : 0 };
}

/** The «By status» view: one group per status with a task, in work-queue order. */
function planGroups(
  p: PlanView,
  opened: ReadonlySet<string>,
  pages: Readonly<Record<string, number>>,
  x: Strings,
  r: Slice,
): (Section | undefined)[] {
  const tasks = r.active ? filter(p.tasks, r.filters) : p.tasks;
  return STATE_ORDER.map((g) => {
    const ofGroup = tasks.filter((t) => t.group === g);
    if (ofGroup.length === 0) return undefined;
    return groupAccordion(p.id, g, ofGroup, r.active || opened.has(g), pages, x, r.terms);
  });
}

function card(
  p: PlanView,
  expanded: boolean,
  menuOpen: boolean,
  openPhases: ReadonlySet<string>,
  openGroups: ReadonlySet<string>,
  pages: Readonly<Record<string, number>>,
  x: Strings,
  r: Slice,
): string {
  const { name, marks } = planMarks(p, x);
  const header = `<button type="button" class="header" data-action="toggle" data-plan="${escapeHtml(p.id)}" aria-expanded="${expanded}">
${name}
${marks}
</button>`;
  const error = p.error !== undefined ? `<p class="error">${escapeHtml(p.error)}</p>` : '';
  const head = `${header}${error}${p.error === undefined ? planProgress(p, x) : ''}${planActions(p, menuOpen, x)}`;
  if (!expanded) return `<article class="plan">${head}</article>`;
  const phases = r.view === 'status' ? planGroups(p, openGroups, pages, x, r) : planPhases(p, openPhases, pages, x, r);
  // The actions stay at the top of the card, open or not: in a large plan, at the bottom they forced scrolling down.
  const tree = sections(phases, true);
  return `<article class="plan expanded">${head}<div class="body" role="tree" aria-label="${escapeHtml(x.t('tree.label'))}">${tree}</div></article>`;
}

/** The bar of the Plans tab: chips by status; in the advanced part, track, tier and «By phase | By status». */
function plansBar(plans: readonly PlanView[], r: Slice, x: Strings): string {
  const all = plans.flatMap((p) => p.tasks);
  const f = r.filters;
  const counts = countByState(all, f);
  const chips = STATE_ORDER.filter((g) => (counts[g] ?? 0) > 0 || f.groups.includes(g))
    .map((g) => chip(`status-${g}`, `data-group="${g}"`, f.groups.includes(g), x.t(`group.${g}`), counts[g] ?? 0))
    .join('');
  const tracks = [...new Set(all.map((t) => t.track).filter(Boolean))].sort();
  const tiers = [...new Set(all.map((t) => t.tier))].sort();
  const selector = (field: 'track' | 'tier', values: readonly string[], chosen: string, label: Key, all: Key): string =>
    `<select class="sel" data-field="${field}" aria-label="${escapeHtml(x.t(label))}">${options(values, chosen, x.t(all))}</select>`;
  const viewButton = (v: 'phase' | 'status', label: Key): string =>
    `<button type="button" class="seg${r.view === v ? ' on' : ''}" data-action="view" data-view="${v}" aria-pressed="${r.view === v}">${escapeHtml(x.t(label))}</button>`;
  const views = `${viewButton('phase', 'filter.byPhase')}${viewButton('status', 'filter.byState')}`;
  const selectors = `${selector('track', tracks, f.track, 'filter.track', 'filter.allTracks')}${selector('tier', tiers, f.tier, 'filter.tier', 'filter.allTiers')}`;
  const html = `${selectors}<span class="segs" role="group" aria-label="${escapeHtml(x.t('filter.view'))}">${views}</span>`;
  return filterBar(
    {
      q: f.q,
      placeholder: 'filter.search',
      chips,
      advanced: { html, active: f.track !== '' || f.tier !== '' || r.view === 'status' },
      isOpen: r.advanced,
      active: r.active,
      match: r.active ? filter(all, f).length : all.length,
      total: all.length,
    },
    x,
  );
}

/** The body of the «Plans» tab: the search and filter bar and a card per plan; without a plan, one line. */
export function plansBody(
  plans: readonly PlanView[],
  expanded: ReadonlySet<string>,
  menuOpen: string | undefined,
  openPhases: Readonly<Record<string, readonly string[]>>,
  pages: Readonly<Record<string, number>>,
  slice: Slice,
  x: Strings,
): string {
  const { filters } = slice;
  let plansListBody: string;
  if (plans.length === 0) {
    // The argument is HTML (the path in <code>): it goes in after escapeHtml on the text.
    const empty = escapeHtml(x.t('panel.empty', '\u0000')).replace('\u0000', '<code>agent_plans/</code>');
    plansListBody = `<p class="empty">${empty}</p>`;
  } else {
    // With a filter in effect, only the plans with a result and all open; when cleared, what the user had comes back.
    const visible = slice.active ? plans.filter((p) => filter(p.tasks, filters).length > 0) : plans;
    const cards = visible
      .map((p) =>
        card(
          p,
          slice.active || expanded.has(p.id),
          menuOpen === p.id,
          new Set(openPhases[p.id] ?? openPhasesByDefault(p)),
          new Set(openPhases[groupsKey(p.id)] ?? openGroupsByDefault()),
          pages,
          x,
          slice,
        ),
      )
      .join('');
    const noResult = slice.active && visible.length === 0 ? `<p class="empty no-result">${escapeHtml(x.t('filter.noResult'))}</p>` : '';
    plansListBody = `${plansBar(plans, slice, x)}${cards}${noResult}`;
  }
  return plansListBody;
}

// The Now tab: a card per plan with something to do, its sections (in progress, waiting for you, available, next) and the filter bar.
import type { Key, Strings } from '@plan-relay/i18n';
import { minutesText } from './duration';
import type { TaskGroup } from './input';
import { countByState, filter, activeNowFilters, termsOf, type Filters, type NowFilters } from './filter';
import { statusIcon } from './icons';
import { nowView, type NowPlan, type TaskView, type PlanView } from './view';
import { type Section, taskList, planMarks, planActions, sections, chip, type BarConfig, filterBar } from './render-shared';
import { escapeHtml } from './util';

/** The «Now» groups in body order, which are also the chips of the bar. */
const NOW_GROUPS: readonly TaskGroup[] = ['in-progress', 'available', 'owner', 'blocked'];

/** What the «Now» tab reads from the page state: open sections, pages and the open «⋯» menu. */
interface NowState {
  openPhases: Readonly<Record<string, readonly string[]>>;
  pages: Readonly<Record<string, number>>;
  menuOpen?: string | undefined;
}

/** The `Saved.openPhases` key of the open «Now» sections of a plan (open by default). */
export function nowKey(plan: string): string {
  return `${plan}\u0000now`;
}

/** The «Now» sections, in card order. */
const NOW_SECTIONS: readonly { group: TaskGroup; key: 'running' | 'owner' | 'available' | 'next'; label: Key }[] = [
  { group: 'in-progress', key: 'running', label: 'now.inProgress' },
  { group: 'owner', key: 'owner', label: 'now.owner' },
  { group: 'available', key: 'available', label: 'now.free' },
  { group: 'blocked', key: 'next', label: 'now.next' },
];

/** The sections that open by themselves in «Now»: all of them. */
export function nowSectionsByDefault(): TaskGroup[] {
  return NOW_SECTIONS.map((s) => s.group);
}

/** The subline of a task in «Now»: what it waits on, how many it unblocks, duration and next step, the phase and whether it can run in parallel. */
function nowSub(p: PlanView, t: TaskView, x: Strings): string[] {
  const sub: string[] = [];
  if (t.group === 'blocked' && t.waitingOn.length) sub.push(escapeHtml(x.t('panel.waits', t.waitingOn.join(', '))));
  if (t.pendingUnblocks > 0) sub.push(escapeHtml(x.t('now.unblocks', String(t.pendingUnblocks))));
  if (t.group === 'in-progress') {
    if (t.duration !== null) sub.push(escapeHtml(minutesText(t.duration, x)));
    if (t.nextStep) sub.push(escapeHtml(t.nextStep));
  }
  // The «Now» tasks come from different phases: the subline says which.
  const phase = p.phases.find((f) => f.dir === t.phase)?.title ?? t.phase;
  if (phase) sub.push(escapeHtml(phase));
  // Text, without the ▶: the icon was confused with the Execute button.
  if (p.parallel.includes(t.id)) sub.push(escapeHtml(x.t('now.parallel')));
  return sub;
}

/**
 * The card of a plan in «Now»: always open, with the plan actions and the sections that ask for action, each one
 * in an accordion (open by default), paginated like the phases and with rows without an icon (the header already shows it).
 */
function nowCard(r: NowPlan, e: NowState, x: Strings, active: boolean, terms: readonly string[]): string {
  const p = r.plan;
  const opened = new Set(e.openPhases[nowKey(p.id)] ?? nowSectionsByDefault());
  const bySection = NOW_SECTIONS.map((s): Section | undefined => {
    const tasks = r[s.key].map((i) => i.task);
    if (tasks.length === 0) return undefined;
    return {
      classes: [`group-${s.group}`],
      opened: active || opened.has(s.group),
      attributes: `data-action="now-section" data-plan="${escapeHtml(p.id)}" data-group="${s.group}" aria-label="${escapeHtml(x.t('tree.group', x.t(s.label), tasks.length))}"`,
      icon: statusIcon(s.group),
      iconColor: `status-${s.group}`,
      title: escapeHtml(x.t(s.label)),
      num: String(tasks.length),
      color: `status-${s.group}`,
      body: () => taskList(p.id, `now:${s.group}`, tasks, e.pages, x, terms, true, (t) => nowSub(p, t, x)),
    };
  });
  const { name, marks } = planMarks(p, x);
  const head = `<div class="header">${name}${marks}</div>${planActions(p, e.menuOpen === p.id, x)}`;
  const tree = sections(bySection, true);
  return `<article class="plan expanded now-plan">${head}<div class="body" role="tree" aria-label="${escapeHtml(x.t('tree.label'))}">${tree}</div></article>`;
}

/**
 * The body of the «Now» tab: the bar (search, chips by group and, with more than one plan, the plan in the advanced part) and a card
 * per plan with something to do, with the sections in progress, waiting for you, available and what unblocks next; with nothing, one line.
 */
export function nowBody(plans: readonly PlanView[], f: NowFilters, advanced: boolean, e: NowState, x: Strings): string {
  if (plans.length === 0) return filteredNowBody(plans, plans, e, x, false, []);
  const active = activeNowFilters(f);
  const ofPlan = f.plan === '' ? plans : plans.filter((p) => p.id === f.plan);
  // The chips count by the search and the plan, not by their own group (they show what would come from selecting them).
  const withoutGroup: Filters = { q: f.q, groups: [], track: '', tier: '' };
  const counts = countByState(
    ofPlan.flatMap((p) => p.tasks),
    withoutGroup,
  );
  const chips = NOW_GROUPS.filter((g) => (counts[g] ?? 0) > 0 || f.groups.includes(g))
    .map((g) => chip(`status-${g}`, `data-group="${g}"`, f.groups.includes(g), x.t(`group.${g}`), counts[g] ?? 0))
    .join('');
  const withFilter: Filters = { ...withoutGroup, groups: f.groups.length ? f.groups : [...NOW_GROUPS] };
  const filtered = active ? ofPlan.map((p) => ({ ...p, tasks: filter(p.tasks, withFilter) })) : plans;
  const ofNow = (ps: readonly PlanView[]): number =>
    ps.reduce((sum, p) => sum + p.tasks.filter((t) => NOW_GROUPS.includes(t.group)).length, 0);
  let barAdvanced: BarConfig['advanced'];
  if (plans.length > 1) {
    const choices = plans.map(
      (p) => `<option value="${escapeHtml(p.id)}"${p.id === f.plan ? ' selected' : ''}>${escapeHtml(p.name)}</option>`,
    );
    // A saved plan that disappeared stays selectable, otherwise the filter would apply without showing.
    if (f.plan !== '' && !plans.some((p) => p.id === f.plan))
      choices.push(`<option value="${escapeHtml(f.plan)}" selected>${escapeHtml(f.plan)}</option>`);
    const label = escapeHtml(x.t('filter.plan'));
    barAdvanced = {
      html: `<select class="sel" data-field="plan" aria-label="${label}"><option value="">${escapeHtml(x.t('filter.allPlans'))}</option>${choices.join('')}</select>`,
      active: f.plan !== '',
    };
  }
  const bar = filterBar(
    {
      q: f.q,
      placeholder: 'filter.searchNow',
      chips,
      advanced: barAdvanced,
      isOpen: advanced,
      active,
      match: ofNow(filtered),
      total: ofNow(plans),
    },
    x,
  );
  return `${bar}${filteredNowBody(plans, filtered, e, x, active, termsOf(f.q))}`;
}

/** The «Now» cards over the tasks that passed the filter; with a filter in effect and nothing, it says nothing was found. */
function filteredNowBody(
  plans: readonly PlanView[],
  filtered: readonly PlanView[],
  e: NowState,
  x: Strings,
  active: boolean,
  terms: readonly string[],
): string {
  const a = nowView(filtered);
  if (active && a.plans.length === 0) return `<p class="empty no-result">${escapeHtml(x.t('filter.noResultNow'))}</p>`;
  // With a filter in effect, «nothing available» and «everything done» would speak of the slice, not of the plan: they are left out.
  let notice = '';
  if (!active && a.empty === 'done' && plans.length > 0) notice = `<p class="now-empty">${escapeHtml(x.t('now.allDone'))}</p>`;
  if (!active && a.empty === 'waiting') notice = `<p class="now-empty">${escapeHtml(x.t('now.nothingFree'))}</p>`;
  return `${notice}${a.plans.map((r) => nowCard(r, e, x, active, terms)).join('')}`;
}

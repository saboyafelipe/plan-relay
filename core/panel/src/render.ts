// Panel HTML from the plan views. Pure: all the text coming from the plans is escaped.
// Actions are elements with `data-action`; the page (page.ts, bound by the host) turns the clicks into messages.
// The interface text comes from `strings` (core/i18n, English without them) and is escaped too.
// Each region has its own file (render-shared, -top, -plans, -now, -ideas, -detail); this one puts the panel together from them and
// re-exports what the rest of the panel uses.
import { stringsFor, type Strings } from '@plan-relay/i18n';
import { activeFilters, EMPTY_NOW_FILTERS, EMPTY_IDEAS_FILTERS, EMPTY_FILTERS, termsOf, type Filters } from './filter';
import { icon } from './icons';
import type { EnvironmentInput, PluginView, Tab } from './types';
import type { IdeasView, PlanView } from './view';
import { type TabBar, footer, pluginStatus, statusText, pluginRow, refreshButton, tabRow } from './render-top';
import type { Slice } from './render-shared';
import { escapeHtml } from './util';
import { taskDetail } from './render-detail';
import { nowBody } from './render-now';
import { ideaDetail, ideasBody, IDEAS_KEY } from './render-ideas';
import { plansBody } from './render-plans';

export { PER_PAGE, DONE_BLOCK, ABANDONED_BLOCK, pageKey } from './render-shared';
export { escapeHtml } from './util';
export { taskDetail } from './render-detail';
export { type TabBar, statusText } from './render-top';
export { TABS, type Tab } from './types';
export { openPhasesByDefault, STATE_ORDER, groupsKey, openGroupsByDefault, type TaskPath, pathToTask } from './render-plans';
export { ideaPlan, IDEAS_KEY, ideasSectionsByDefault } from './render-ideas';
export { nowKey, nowSectionsByDefault } from './render-now';

/** What `render` draws from; everything but the plans and the time has a default. */
export interface RenderInput {
  plans: readonly PlanView[];
  /** The time of the last reading, in the status tooltip. */
  updated: string;
  /** The plans whose card is open (Plans tab). None by default. */
  expanded?: ReadonlySet<string> | undefined;
  /** A reading is under way: the top is busy and «Refresh» disabled. */
  loading?: boolean | undefined;
  plugin?: PluginView | undefined;
  /** The interface language; English by default. */
  strings?: Strings | undefined;
  environment?: EnvironmentInput | undefined;
  ideas?: IdeasView | undefined;
  /** Host notices, one line each at the top. */
  notices?: readonly string[] | undefined;
  /** The active tab; Plans by default. */
  tab?: Tab | undefined;
  /** The plan whose «…» menu is open. */
  menuOpen?: string | undefined;
  /** The open sections, by plan, groups key, Now key or the ideas key. */
  openPhases?: Readonly<Record<string, readonly string[]>> | undefined;
  /** How many pages of each phase are shown, by `pageKey`. */
  pages?: Readonly<Record<string, number>> | undefined;
  /** The task, or the idea (by its file), whose detail popup is open. */
  detail?: { plan: string; id: string } | { idea: string } | undefined;
  /** The Plans tab filters. */
  filters?: Filters | undefined;
  /** The Plans tab grouping: by phase (default) or by status. */
  view?: 'phase' | 'status' | undefined;
  /** «Collapse all», the status and «Refresh» in the tab row; a host with its own title bar asks for false. */
  actionsInRow?: boolean | undefined;
  /** The Now and Ideas filters and the advanced switch. */
  tabBar?: TabBar | undefined;
}

/**
 * The whole panel: the top (plugin status and host notices) only when something asks for action; the tab row Now,
 * Plans and Ideas, with the status/time and «Refresh» as icons on the right, and the body of the active tab (`tab`, Plans by default); at the end, the environment footer.
 * With `toLoad`, the top is busy and the button disabled; the language is the one of `strings` (English without them).
 */
export function render(input: RenderInput): string {
  const { plans, updated, plugin, environment, ideas, menuOpen, detail } = input;
  const expanded = input.expanded ?? new Set<string>();
  const toLoad = input.loading ?? false;
  const x = input.strings ?? stringsFor();
  const notices = input.notices ?? [];
  const tab = input.tab ?? 'plans';
  const openPhases = input.openPhases ?? {};
  const pages = input.pages ?? {};
  const filters = input.filters ?? EMPTY_FILTERS;
  const view = input.view ?? 'phase';
  const actionsInRow = input.actionsInRow ?? true;
  const bar = input.tabBar ?? {};
  const advanced = bar.advanced ?? false;
  const slice: Slice = { filters, view, active: activeFilters(filters), terms: termsOf(filters.q), advanced };
  const finished = footer(environment, x);
  let popup = '';
  if (detail && 'idea' in detail) popup = ideaDetail(ideas, detail.idea, x);
  else if (detail) {
    const detailPlan = plans.find((p) => p.id === detail.plan);
    if (detailPlan) popup = taskDetail(detailPlan, detail.id, x);
  }
  const busy = toLoad || plugin?.state === 'installing';
  // The top only exists when something asks for the owner (plugin missing, outdated, installing, with an error; or a host notice).
  // With everything up to date, the status and the time become the tooltip of an icon in the tab row.
  const st = pluginStatus(plugin, x);
  const tooltip = escapeHtml(statusText(plugin, updated, x));
  const lines = `${st.asksAction ? pluginRow(plugin, st.text, st.button) : ''}${notices.map((a) => `<p class="host-notice" data-announce>${escapeHtml(a)}</p>`).join('')}`;
  const head = lines ? `<header class="top">${lines}</header>` : '';
  // Only the body of the active tab is built: the others do not go into the HTML (nor cost the drawing).
  let body: string;
  if (tab === 'now') body = nowBody(plans, bar.now ?? EMPTY_NOW_FILTERS, advanced, { openPhases, pages, menuOpen }, x);
  else if (tab === 'ideas') body = ideasBody(ideas, bar.ideas ?? EMPTY_IDEAS_FILTERS, openPhases[IDEAS_KEY], x);
  else body = plansBody(plans, expanded, menuOpen, openPhases, pages, slice, x);
  // «Collapse all» also in the panel, not only in the view title bar (which the host may hide on overflow); only on the Plans tab.
  const collapseLabel = escapeHtml(x.t('panel.collapseAll'));
  const collapseAll =
    tab === 'plans' && plans.length
      ? `<button type="button" class="ib tabs-action" data-action="collapse-all" aria-label="${collapseLabel}" title="${collapseLabel}">${icon('collapse-all')}</button>`
      : '';
  // To the right of the tabs: «Collapse all» (Plans), the plugin status and the time (tooltip only) and «Refresh». A host with its own
  // title bar (VS Code) takes the three there and asks for the row without them.
  const actions = actionsInRow
    ? `${collapseAll}<span class="ib tabs-status" role="img" aria-label="${tooltip}" title="${tooltip}">${icon('info')}</span>${refreshButton(toLoad, x)}`
    : '';
  // The counters say what asks for you: Now, what is in progress, the owner's or available (the Now body);
  // Plans, the plans; Ideas, the open ones (neither `mapped` nor `invalid`).
  const tasksIn = (group: string): number => plans.reduce((sum, p) => sum + p.tasks.filter((t) => t.group === group).length, 0);
  const ofOwner = tasksIn('owner');
  const counters: Record<Tab, number> = {
    now: tasksIn('in-progress') + ofOwner + tasksIn('available'),
    plans: plans.length,
    ideas: ideas?.items.filter((i) => i.status !== 'mapped' && i.status !== 'invalid').length ?? 0,
  };
  const labels: Record<Tab, string> = { now: x.t('view.now'), plans: x.t('view.plans'), ideas: x.t('ideas.title') };
  const row = tabRow(tab, labels, counters, ofOwner, actions, busy, x);
  const panel = `<div class="tab-panel" id="tab-panel" role="tabpanel" aria-labelledby="tab-${tab}">${body}</div>`;
  return `${head}${row}${panel}${finished}${popup}`;
}

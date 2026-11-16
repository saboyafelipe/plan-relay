// Pieces every region of the panel is built from: the accordion section, the task row and list, the top of a plan card and the
// search and filter bar. Pure, like the rest of the render: all the text coming from the plans is escaped.
import type { Key, Strings } from '@plan-relay/i18n';
import { minutesText } from './duration';
import type { TaskGroup } from './input';
import { highlight, type IdeaState, type Filters } from './filter';
import { icon, statusIcon, type IconName } from './icons';
import type { PhaseView, TaskView, PlanView } from './view';
import { badgeLabel, type CardBadge } from './badge';
import { button, domId, escapeHtml, labelled } from './util';

export function openButton(plan: string, file: string, content: string, cls: string): string {
  return `<button type="button" class="${cls}" data-action="open" data-plan="${escapeHtml(plan)}" data-file="${escapeHtml(file)}">${content}</button>`;
}

/** How many tasks a phase shows per page; «show more» adds another. */
export const PER_PAGE = 8;

/** The reserved «dir», in the plan `Saved.openPhases`, of the «Completed phases» block. */
export const DONE_BLOCK = '@done';

/** The reserved «dir» of the «Abandoned phases» block: the phases a give-up emptied, below the completed ones. */
export const ABANDONED_BLOCK = '@abandoned';

/** The phase is finished: it has tasks and all of them are done. */
export function phaseDone(f: Pick<PhaseView, 'total' | 'done'>): boolean {
  return f.total > 0 && f.done === f.total;
}

/** The page key of a phase in `Saved.pages`: the plan and the phase folder (the `dir`s repeat across plans). */
export function pageKey(plan: string, dir: string): string {
  return `${plan}\u0000${dir}`;
}

/**
 * The row common to the tabs: the body (optional status icon, ID and title on 1 line) is the tree item;
 * on the right, the hover actions and then the main one, always visible and in the same place; below, the subline, only with content.
 * All the HTML that comes in here is already escaped.
 *
 * A tree may only own tree items and groups, so the actions and the subline stay out of the accessibility tree: every
 * action is also in the detail dialog the tree item opens, and the subline text reaches a screen reader as the
 * description of the tree item.
 */
interface Row {
  /** What identifies the row in the document (plan and task, or the idea file): the `id` of its subline comes from it. */
  key: string;
  /** Extra classes of the `<li>` (status, indentation). */
  classes: readonly string[];
  /** The status icon; `null` in the homogeneous group, where the header already shows it and the ID takes its place. */
  icon: string | null;
  id: string;
  title: string;
  /** The body attributes (already escaped): `role`, level, label, action and `title`. */
  attributes: string;
  hover: readonly string[];
  main: string;
  sub: readonly string[];
}

export function row(l: Row): string {
  const classes = ['ln', ...l.classes, ...(l.icon === null ? ['no-ic'] : [])].join(' ');
  const subId = domId('sub', l.key);
  const described = l.sub.length ? ` aria-describedby="${subId}"` : '';
  const body = `<button type="button" class="ln-body" ${l.attributes}${described}>${l.icon ?? ''}<span class="id">${l.id}</span><span class="tt">${l.title}</span></button>`;
  const actions = `<span class="acts" aria-hidden="true"><span class="hov">${l.hover.join('')}</span>${l.main}</span>`;
  const sub = l.sub.length ? `<div class="sub" id="${subId}" aria-hidden="true">${l.sub.join(' · ')}</div>` : '';
  return `<li class="${classes}" role="none">${body}${actions}${sub}</li>`;
}

/**
 * The common accordion section: arrow, icon, label, counters and the number at the end; when open, it brings the body.
 * With `color`, the group is homogeneous: the number becomes a counter in the status color.
 */
export interface Section {
  /** Extra classes of the container (`phase`, `group-…`, `done`). */
  classes: readonly string[];
  opened: boolean;
  /** The header attributes (already escaped): label and action with the `data-*`. */
  attributes: string;
  /** The icon and the class that colors it: `status-<group>` of the task or, in Ideas, `idea-color-<state>`. */
  icon: string;
  iconColor: ColorClass;
  title: string;
  tooltipTitle?: string;
  badges?: string;
  num: string;
  color?: ColorClass;
  body: () => string;
}

/** The color class of a status: the task one (`status-*`) or the idea one (`idea-color-*`). */
type ColorClass = `status-${TaskGroup}` | `idea-color-${IdeaState}`;

/** What the header of a detail popup shows: the icon (HTML), the id, the status pill and the title, as text. */
export interface DialogHead {
  icon: string;
  id: string;
  color: ColorClass;
  status: string;
  title: string;
}

/**
 * A detail popup (task or idea): a `<dialog>` labeled by its title, with the header, the body and the footer buttons
 * (all HTML but the header's texts). The page opens it with `showModal`, which traps focus.
 */
export function detailDialog(h: DialogHead, body: string, buttons: readonly string[], x: Strings): string {
  const close = escapeHtml(x.t('detail.close'));
  const pill = `<span class="pill"><i class="${h.color}"></i>${escapeHtml(h.status)}</span>`;
  const text = `<div class="dh-body"><span class="id">${escapeHtml(h.id)}</span> ${pill}<h2 id="dlg-title">${escapeHtml(h.title)}</h2></div>`;
  const head = `<div class="dh">${h.icon}${text}${button(`class="ib" data-action="close" ${labelled(close)}`, icon('close'))}</div>`;
  return `<dialog class="dlg" aria-modal="true" aria-labelledby="dlg-title">${head}${body}<div class="df">${buttons.join('')}</div></dialog>`;
}

/** A section; `focusable` puts its header in the Tab order (`tabindex` 0), which only the first header of a tree gets. */
function section(s: Section, focusable = false): string {
  const classes = ['sec', ...s.classes, ...(s.opened ? ['opened'] : [])].join(' ');
  const tooltip = s.tooltipTitle === undefined ? '' : ` title="${s.tooltipTitle}"`;
  const numClasses = ['sec-num', ...(s.color ? ['pc', s.color] : [])].join(' ');
  const num = `<span class="${numClasses}">${s.num}</span>`;
  const badges = s.badges === undefined ? '' : `<span class="badges">${s.badges}</span>`;
  const ic = s.icon === '' ? '' : `<span class="sec-ic ${s.iconColor}">${s.icon}</span>`;
  const attributes = `class="sec-head" role="treeitem" tabindex="${focusable ? 0 : -1}" aria-level="1" ${s.attributes} aria-expanded="${s.opened}"`;
  const title = `<span class="sec-title"${tooltip}>${s.title}</span>`;
  const head = button(attributes, `${icon('collapse')}${ic}${title}<span class="sec-summary">${badges}${num}</span>`);
  return `<div class="${classes}" role="none">${head}${s.opened ? s.body() : ''}</div>`;
}

/**
 * Sections one after the other, the empty slots skipped. A tree has a roving tabindex: only its first item is in the Tab order and the
 * page moves the 0 with focus; with `tree`, the first section is built focusable. Nested sections never are.
 */
export function sections(list: readonly (Section | undefined)[], tree = false): string {
  return list
    .filter((s): s is Section => s !== undefined)
    .map((s, i) => section(s, tree && i === 0))
    .join('');
}

/** The groups of `Status: ready` (available, owner, waiting) and the draft: only these can be given up. */
export const GIVE_UP_GROUPS: ReadonlySet<TaskGroup> = new Set(['available', 'owner', 'blocked', 'draft']);

/** The button of the main action of the row (▶), in the «available» color. */
const MAIN_CLASS = ['ib', 'run'].join(' ');

/**
 * A link to the row of another task of the same plan: the page opens its phase and moves focus there. Out of the Tab
 * order, like the row buttons: the tree is a single Tab stop, and the detail carries the same link for the keyboard.
 */
function taskLink(plan: string, id: string, text: string, tooltip?: string): string {
  const title = tooltip === undefined ? '' : ` title="${escapeHtml(tooltip)}"`;
  return `<button type="button" class="link" data-action="go" data-plan="${escapeHtml(plan)}" data-id="${escapeHtml(id)}"${title} tabindex="-1">${escapeHtml(text)}</button>`;
}

/**
 * The subline of a task in Plans: duration and next step of the in-progress one, what the blocked one waits on, the replacement of the
 * cancelled one («→ <replacement ID>») and the give-up root on the abandoned one.
 */
function taskSub(plan: string, t: TaskView, x: Strings): string[] {
  const sub: string[] = [];
  if (t.group === 'cancelled' && t.replacement)
    sub.push(taskLink(plan, t.replacement, `→ ${t.replacement}`, x.t('panel.replacedBy', t.replacement)));
  if (t.group === 'abandoned') {
    if (t.giveUpRoot) {
      // The argument is HTML (the link): it goes in after escapeHtml on the text.
      sub.push(escapeHtml(x.t('panel.abandonedWith', '\u0000')).replace('\u0000', taskLink(plan, t.giveUpRoot, t.giveUpRoot)));
    } else if (t.ownerGiveUp) sub.push(escapeHtml(x.t('panel.ownerGiveUp')));
  }
  if (t.group === 'in-progress') {
    if (t.duration !== null) sub.push(escapeHtml(minutesText(t.duration, x)));
    if (t.nextStep) sub.push(escapeHtml(t.nextStep));
  }
  if (t.group === 'blocked' && t.waitingOn.length) sub.push(escapeHtml(x.t('panel.waits', t.waitingOn.join(', '))));
  return sub;
}

/** The row of a task over the common row; `flat` is the by-status list (homogeneous group, no indentation and no icon). */
function taskRow(
  plan: string,
  t: TaskView,
  x: Strings,
  terms: readonly string[] = [],
  flat = false,
  subOf?: (t: TaskView) => string[],
): string {
  const p = escapeHtml(plan);
  const id = escapeHtml(t.id);
  // «Now» builds the whole subline; in Plans, duration and next step, or what the blocked one waits on.
  const sub = subOf ? subOf(t) : taskSub(plan, t, x);
  const rowButton = (action: string, data: string, label: Key, ic: IconName, isMain = false): string => {
    const r = escapeHtml(x.t(label));
    return `<button type="button" class="${isMain ? MAIN_CLASS : 'ib'}" data-action="${action}" data-plan="${p}" ${data} aria-label="${r}" title="${r}" tabindex="-1">${icon(ic)}</button>`;
  };
  let main = '';
  if (t.group === 'in-progress') main = rowButton('execute', `data-id="${id}"`, 'panel.resume', 'play', true);
  else if (t.group === 'available' || t.group === 'owner') main = rowButton('execute', `data-id="${id}"`, 'panel.run', 'play', true);
  const hover = [
    rowButton('detail', `data-id="${id}"`, 'panel.detail', 'info'),
    rowButton('open', `data-file="${escapeHtml(t.file)}"`, 'panel.openFile', 'file'),
  ];
  // Give up only on ready and draft; reopen only on the root of a give-up.
  if (GIVE_UP_GROUPS.has(t.group)) hover.push(rowButton('giveUp', `data-id="${id}"`, 'panel.giveUp', 'giveUp'));
  if (t.group === 'abandoned' && t.ownerGiveUp) hover.push(rowButton('reopen', `data-id="${id}"`, 'panel.reopen', 'reopen'));
  const classes = [`group-${t.group}`];
  // In the by-status list the tasks come from several phases: no subtask indentation.
  if (t.depth > 0 && !flat) classes.push('child', `depth-${Math.min(t.depth, 2)}`);
  const tier = flat ? 2 : 2 + (t.depth > 0 ? Math.min(t.depth, 2) : 0);
  // The status stays in the label (`tree.task`) even when the row has no icon; the tier leaves the row and goes to the tooltip.
  const label = escapeHtml(x.t('tree.task', t.id, t.title, x.t(`detail.status-${t.group}`)));
  const tooltip = escapeHtml(`${t.title} · ${x.t('detail.tier')}: ${t.tier}`);
  return row({
    key: `${plan}\u0000${t.id}`,
    classes,
    icon: flat ? null : statusIcon(t.group),
    id: highlight(t.id, terms),
    title: highlight(t.title, terms),
    attributes: `role="treeitem" tabindex="-1" aria-level="${tier}" aria-label="${label}" data-action="detail" data-plan="${p}" data-id="${id}" title="${tooltip}"`,
    hover,
    main,
    sub,
  });
}

/** The tasks of the phase, `PER_PAGE` per page, with «show more» while some remain. */
export function taskList(
  plan: string,
  list: string,
  tasks: readonly TaskView[],
  pages: Readonly<Record<string, number>>,
  x: Strings,
  terms: readonly string[],
  flat: boolean,
  subOf?: (t: TaskView) => string[],
): string {
  const key = pageKey(plan, list);
  const n = Math.max(pages[key] ?? PER_PAGE, PER_PAGE);
  const items = tasks
    .slice(0, n)
    .map((t) => taskRow(plan, t, x, terms, flat, subOf))
    .join('');
  const rest = tasks.length - n;
  const data = `data-action="more" data-plan="${escapeHtml(plan)}" data-phase="${escapeHtml(list)}"`;
  const showMore = escapeHtml(x.t('panel.showMore', Math.min(rest, PER_PAGE), rest));
  const more =
    rest > 0
      ? `<li class="more" role="none">${button(`class="more-link" role="treeitem" tabindex="-1" aria-level="2" ${data}`, showMore)}</li>`
      : '';
  return `<ul class="rows" role="group">${items}${more}</ul>`;
}

/** What the task list shows beyond the data: the filters, the grouping and the words to highlight. */
export interface Slice {
  filters: Filters;
  view: 'phase' | 'status';
  active: boolean;
  terms: string[];
  /** The advanced part of the bar (track, tier, grouping) is open. */
  advanced: boolean;
}

function menuItem(action: string, plan: string, label: string, iconName: IconName, extra = '', danger = false): string {
  const attributes = `role="menuitem" tabindex="-1" class="mi${danger ? ' danger' : ''}" data-action="${action}" data-plan="${escapeHtml(plan)}"${extra}`;
  return button(attributes, `${icon(iconName)}<span>${escapeHtml(label)}</span>`);
}

/** The «⋯» menu: open PLAN, MAP and README, copy the command and, last and in red, delete. A plan with an error only opens and deletes. */
function planMenu(p: PlanView, x: Strings): string {
  const openItem = (file: string, label: Key, icon: IconName): string =>
    menuItem('open', p.id, x.t(label), icon, ` data-file="${escapeHtml(file)}"`);
  const items = [openItem('PLAN.md', 'panel.menuPlan', 'file')];
  if (p.error === undefined) items.push(openItem('MAP.md', 'panel.menuMap', 'mapAction'));
  items.push(openItem('README.md', 'panel.menuReadme', 'file'));
  if (p.error === undefined) items.push('<hr role="separator">', menuItem('copy', p.id, x.t('panel.menuCopy'), 'copy'));
  items.push('<hr role="separator">', menuItem('delete', p.id, x.t('panel.menuDelete'), 'trash', '', true));
  return `<div class="menu" role="menu" aria-label="${escapeHtml(x.t('panel.moreActions'))}">${items.join('')}</div>`;
}

/** The card actions: «Run» (primary), «Map» and, when there is a `run`, «Log»; the rest and «Delete» in the «⋯» menu. */
export function planActions(p: PlanView, menuOpen: boolean, x: Strings): string {
  const buttons: string[] = [];
  if (p.error === undefined) {
    buttons.push(
      `<button type="button" class="btn pri" data-action="run" data-plan="${escapeHtml(p.id)}">${icon('play')}${escapeHtml(x.t('panel.runPlan'))}</button>`,
      openButton(p.id, 'MAP.md', `${icon('mapAction')}${escapeHtml(x.t('panel.map'))}`, 'btn'),
    );
    if (p.log !== undefined) buttons.push(openButton(p.id, p.log, `${icon('log')}${escapeHtml(x.t('panel.log'))}`, 'btn'));
  }
  const label = escapeHtml(x.t('panel.moreActions'));
  const menuAttributes = `class="ib${menuOpen ? ' on' : ''}" data-action="menu" data-plan="${escapeHtml(p.id)}" aria-haspopup="menu" aria-expanded="${menuOpen}"`;
  const more = `<span class="menu-wrap">${button(`${menuAttributes} ${labelled(label)}`, icon('more'))}${menuOpen ? planMenu(p, x) : ''}</span>`;
  // The last button and the «⋯» in a group that does not wrap: in the narrow view they drop together, and the «⋯» is never left alone.
  const last = buttons.pop() ?? '';
  return `<div class="pact">${buttons.join('')}<span class="pact-end">${last}<span class="sp"></span>${more}</span></div>`;
}

/** The plan name, the pill of the open run and the badge: the top of the card, in Plans and in «Now». */
export function planMarks(p: PlanView, x: Strings): { name: string; marks: string } {
  const badge: CardBadge | undefined = p.error !== undefined ? 'error' : p.badge;
  const badgeSpan = badge === undefined ? '' : `<span class="badge badge-${badge}">${escapeHtml(badgeLabel(badge, x))}</span>`;
  // With the «run open» badge the pill would say the same (in English, both read «run open»): only the badge stays.
  const pill =
    p.runOpen && badge !== 'run-open'
      ? `<span class="pill"><i class="status-in-progress"></i>${escapeHtml(x.t('panel.runOpen'))}</span>`
      : '';
  return { name: `<span class="name">${escapeHtml(p.name)}</span>`, marks: `<span class="marks">${pill}${badgeSpan}</span>` };
}

export function options(values: readonly string[], chosen: string, all: string): string {
  const list = [...values];
  // A saved value that disappeared from the plan stays selectable, otherwise the filter would apply without showing.
  if (chosen !== '' && !list.includes(chosen)) list.push(chosen);
  return [`<option value="">${escapeHtml(all)}</option>`]
    .concat(list.map((v) => `<option value="${escapeHtml(v)}"${v === chosen ? ' selected' : ''}>${escapeHtml(v)}</option>`))
    .join('');
}

/** What the search bar of a tab carries: the same drawing in the three, the content of each. */
export interface BarConfig {
  q: string;
  placeholder: Key;
  /** The chips, already as HTML. */
  chips: string;
  /** The advanced content (HTML) and whether something in it is in effect; without it, the tab has no funnel. */
  advanced?: { html: string; active: boolean } | undefined;
  /** The advanced part is open. */
  isOpen: boolean;
  /** Some filter of the tab is in effect: the «×», the «n of m» and the «clear» appear. */
  active: boolean;
  match: number;
  total: number;
}

/** A filter chip: the label, the count of what would come from selecting it and the on/off state. */
export function chip(cls: string, dataAttribute: string, on: boolean, label: string, n: number): string {
  return `<button type="button" class="chip ${cls}${on ? ' on' : ''}" data-action="chip" ${dataAttribute} aria-pressed="${on}">${escapeHtml(label)}<span class="n">${n}</span></button>`;
}

/**
 * The search and filter bar, pinned to the top of the tab when scrolling, the same in the three tabs: on the first row the search
 * field, the clear «×» (with a filter in effect) and the advanced funnel (only on the tab that has an advanced part, with a dot when
 * something in it is in effect); on the second, the chips with the count. Open, the advanced part comes below; with a filter in effect, the
 * «n of m» and the «clear», so the filter is never hidden behind the closed funnel.
 */
export function filterBar(c: BarConfig, x: Strings): string {
  const clearLabel = escapeHtml(x.t('filter.clearLabel'));
  // The «×» next to the field: the «clear» of the «n of m» sits below the chips and goes unnoticed.
  const clearButton = c.active
    ? `<button type="button" class="ib" data-action="clear" aria-label="${clearLabel}" title="${clearLabel}">${icon('close')}</button>`
    : '';
  let funnel = '';
  if (c.advanced) {
    const label = escapeHtml(x.t(c.advanced.active ? 'filter.moreActive' : 'filter.more'));
    const controls = c.isOpen ? ' aria-controls="filters-advanced"' : '';
    const dot = c.advanced.active ? '<span class="dot" aria-hidden="true"></span>' : '';
    const attributes = `class="ib funnel${c.isOpen ? ' on' : ''}" data-action="advanced" aria-expanded="${c.isOpen}"${controls}`;
    funnel = button(`${attributes} ${labelled(label)}`, `${icon('filter')}${dot}`);
  }
  const placeholder = escapeHtml(x.t(c.placeholder));
  const field = `class="search" data-field="q" value="${escapeHtml(c.q)}" placeholder="${placeholder}" aria-label="${placeholder}"`;
  const search = `<div class="search-row"><input type="search" ${field} autocomplete="off" spellcheck="false">${clearButton}${funnel}</div>`;
  const chips = `<div class="chips" role="group" aria-label="${escapeHtml(x.t('filter.states'))}">${c.chips}</div>`;
  const advanced = c.advanced && c.isOpen ? `<div class="advanced" id="filters-advanced">${c.advanced.html}</div>` : '';
  const count = `<span class="nm" data-announce>${escapeHtml(x.t('filter.nOfM', c.match, c.total))}</span>`;
  const nOfM = c.active
    ? `<div class="row-nm">${count}${button('class="btn sm" data-action="clear"', escapeHtml(x.t('filter.clear')))}</div>`
    : '';
  return `<div class="filters">${search}${chips}${advanced}${nOfM}</div>`;
}

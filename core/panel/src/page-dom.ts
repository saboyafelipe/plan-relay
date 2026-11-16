// What the page does with the DOM it drew and does not keep as state: focus, measures, scrolling and the keyboard
// patterns of the tab row, the tree, the menu and the detail.
import { TABS, type Tab } from './render';
import { isTab } from './saved';

/** A value quoted for an attribute selector. */
export function quote(v: string): string {
  return v.replace(/["\\]/g, '\\$&');
}

/** The row of a task in the Plans list: where «go» lands and where focus returns when the detail closes. */
export function rowSelector(plan: string, id: string): string {
  return `.ln-body[data-action="detail"][data-plan="${quote(plan)}"][data-id="${quote(id)}"]`;
}

/** The row of an idea in the Ideas tree: where focus returns when its detail closes. */
export function ideaRowSelector(idea: string): string {
  return `.ln-body[data-action="idea-detail"][data-idea="${quote(idea)}"]`;
}

/** The «⋯» button of the card of `plan`. */
export function menuButtonSelector(plan: string): string {
  return `[data-action="menu"][data-plan="${quote(plan)}"]`;
}

/** The `data-*` that, besides `data-action`, identify the focused element across a redraw, in selector order. */
const FOCUS_KEYS = ['plan', 'tab', 'id', 'idea', 'file', 'phase', 'group', 'view', 'status'] as const;

/** The element with focus, as a selector: the redraw replaces all the HTML and focus is restored through the same `data-*`. */
export function focusSelector(root: HTMLElement): string | undefined {
  const active = root.ownerDocument.activeElement;
  if (!active || !root.contains(active) || !(active instanceof HTMLElement)) return undefined;
  const { action, field } = active.dataset;
  // Search and filter fields are found by `data-field`; the rest, by `data-action` plus what identifies it.
  if (field) return `[data-field="${field}"]`;
  if (!action) return undefined;
  const identifying = FOCUS_KEYS.map((k) => {
    const v = active.dataset[k];
    return v === undefined ? '' : `[data-${k}="${quote(v)}"]`;
  });
  return `[data-action="${action}"]${identifying.join('')}`;
}

/** The cursor and selection of the search field with focus, to put back after the redraw. */
export function searchSelection(root: HTMLElement): [number, number] | undefined {
  const active = root.ownerDocument.activeElement;
  return active instanceof HTMLInputElement && root.contains(active) && active.dataset.field === 'q' && active.selectionStart !== null
    ? [active.selectionStart, active.selectionEnd ?? active.selectionStart]
    : undefined;
}

/** Focus back on the element `selector` names, inside `scope`, with the search cursor where it was. */
export function restoreFocus(scope: ParentNode, selector: string, selection: [number, number] | undefined): void {
  const target = scope.querySelector<HTMLElement>(selector);
  target?.focus();
  // The tree item that regains focus becomes the Tab stop again.
  rove(target);
  if (selection && target instanceof HTMLInputElement && target.dataset.field === 'q') target.setSelectionRange(selection[0], selection[1]);
}

/** The open menu opens to the left (aligned to the right of the button); without room below, it opens upward. */
export function positionMenu(root: HTMLElement): void {
  const menu = root.querySelector<HTMLElement>('.menu');
  if (!menu) return;
  const box = menu.getBoundingClientRect();
  const height = root.ownerDocument.defaultView?.innerHeight ?? 0;
  // `above` only if there is room above: otherwise, better cut off below (the view scrolls) than off screen.
  const button = menu.parentElement?.querySelector<HTMLElement>('[data-action="menu"]')?.getBoundingClientRect();
  if (height > 0 && button && box.bottom > height && button.top - box.height > 0) menu.classList.add('above');
}

/**
 * The heights of the pinned parts go to the root: the tab row one in `--pr-tabs-height` (the filter bar pins right
 * below it) and the bar one in `--pr-filters-height` (the card header pins below both).
 */
export function measureFilters(root: HTMLElement): void {
  const tabs = root.querySelector<HTMLElement>('.tabs');
  const bar = root.querySelector<HTMLElement>('.filters');
  root.style.setProperty('--pr-tabs-height', `${tabs?.offsetHeight ?? 0}px`);
  root.style.setProperty('--pr-filters-height', `${bar?.offsetHeight ?? 0}px`);
  // The chips sit in a row that scrolls: when they do not fit, the right edge fades (`.overflows`).
  const chips = bar?.querySelector<HTMLElement>('.chips');
  chips?.classList.toggle('overflows', chips.scrollWidth > chips.clientWidth);
}

/**
 * How far the top of the window is covered for `el`: the lowest bottom among the tab row, the filter bar and the
 * pinned strip of its card. All three are `sticky` and the browser does not discount them when scrolling to focus.
 * Outside a card the row and the bar count; the strip of another card does not reach `el`.
 */
function topCovered(root: HTMLElement, el: Element): number {
  const tabs = root.querySelector('.tabs')?.getBoundingClientRect().bottom ?? 0;
  const bar = root.querySelector('.filters')?.getBoundingClientRect().bottom ?? 0;
  const band = el.closest('.plan')?.querySelector(':scope > .header')?.getBoundingClientRect().bottom ?? 0;
  return Math.max(tabs, bar, band);
}

/** The item that received focus and fell under the pinned bar or strip scrolls to just below them. */
function showUnderTop(root: HTMLElement, el: HTMLElement): void {
  const missing = el.getBoundingClientRect().top - topCovered(root, el);
  if (missing < 0) root.ownerDocument.defaultView?.scrollBy(0, missing);
}

/** The «⋯» button of `plan` went under the bar or the strip (or is gone): the open menu, which follows it, should close. */
export function menuButtonCovered(root: HTMLElement, plan: string): boolean {
  const button = root.querySelector(menuButtonSelector(plan));
  return button !== null && button.getBoundingClientRect().top < topCovered(root, button);
}

/** Whether a click on the `<dialog>` itself landed outside its box: on the darkened backdrop. */
export function onBackdrop(dialog: Element, event: MouseEvent): boolean {
  const box = dialog.getBoundingClientRect();
  const { clientX: x, clientY: y } = event;
  return !(x >= box.left && x <= box.right && y >= box.top && y <= box.bottom);
}

/** Roving tabindex: only the tree item with focus has `tabindex="0"` (Tab enters and leaves the tree in a single stop). */
export function rove(target: Element | null | undefined): void {
  const tree = target?.closest('[role="tree"]');
  if (!target || !tree || target.getAttribute('role') !== 'treeitem') return;
  for (const i of tree.querySelectorAll('[role="treeitem"][tabindex="0"]')) i.setAttribute('tabindex', '-1');
  target.setAttribute('tabindex', '0');
}

/**
 * The focused chip fully in view: Chromium only scrolls on focus when nothing at all shows, and a half-cut chip
 * already counts as visible. The `scroll-padding-inline` of `.chips.overflows` makes the chip stop outside the fade.
 */
export function showChip(target: Element | null | undefined): void {
  target?.closest('.chips .chip')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

/** Focuses the search of the active tab: the shortcut and the «Filter» command. */
export function focusSearch(root: HTMLElement): void {
  const field = root.querySelector<HTMLInputElement>('[data-field="q"]');
  field?.focus();
  field?.select();
}

/**
 * The tab row by keyboard (WAI-ARIA «Tabs» pattern, automatic activation): Left and Right go to the neighbouring tab,
 * wrapping at the ends; Home and End go to the first and the last. Gives the tab to select, or nothing when the key
 * does not belong to the tabs.
 */
export function tabForKey(event: KeyboardEvent): Tab | undefined {
  const current = (event.target as Element | null)?.closest<HTMLElement>('[role="tab"]')?.dataset.tab;
  if (!isTab(current) || event.altKey || event.ctrlKey || event.metaKey) return undefined;
  const i = TABS.indexOf(current);
  const n = TABS.length;
  if (event.key === 'ArrowRight') return TABS[(i + 1) % n] ?? current;
  if (event.key === 'ArrowLeft') return TABS[(i - 1 + n) % n] ?? current;
  if (event.key === 'Home') return TABS[0] ?? current;
  if (event.key === 'End') return TABS[n - 1] ?? current;
  return undefined;
}

/**
 * The tree of phases and tasks by keyboard (WAI-ARIA «Tree View» pattern): up and down walk the visible items, Home
 * and End go to the first and the last, right opens the phase (when open, enters the first task), left closes the
 * phase (on a task, goes up to the phase). Enter and Space act through the button: they open the detail or toggle the phase.
 */
export function navigateTree(root: HTMLElement, event: KeyboardEvent): void {
  const current = (event.target as Element | null)?.closest('[role="treeitem"]');
  const tree = current?.closest('[role="tree"]');
  if (!current || !tree || event.altKey || event.ctrlKey || event.metaKey) return;
  const items = [...tree.querySelectorAll<HTMLElement>('[role="treeitem"]')];
  const i = items.indexOf(current as HTMLElement);
  const tier = (e: Element | undefined): number => Number(e?.getAttribute('aria-level') ?? 0);
  const isPhase = current.hasAttribute('aria-expanded');
  const opened = current.getAttribute('aria-expanded') === 'true';
  let target: HTMLElement | undefined;
  if (event.key === 'ArrowDown') target = items[i + 1];
  else if (event.key === 'ArrowUp') target = items[i - 1];
  else if (event.key === 'Home') target = items[0];
  else if (event.key === 'End') target = items.at(-1);
  else if (event.key === 'ArrowRight') {
    if (!isPhase) return;
    if (!opened) {
      // The redraw returns focus to the same phase (through the `data-*`).
      event.preventDefault();
      (current as HTMLElement).click();
      return;
    }
    if (tier(items[i + 1]) > tier(current)) target = items[i + 1];
  } else if (event.key === 'ArrowLeft') {
    if (isPhase && opened) {
      event.preventDefault();
      (current as HTMLElement).click();
      return;
    }
    for (let k = i - 1; k >= 0 && !target; k--) if (tier(items[k]) < tier(current)) target = items[k];
  } else return;
  event.preventDefault();
  if (!target) return;
  rove(target);
  target.focus();
  showUnderTop(root, target);
}

/** Tab and Shift+Tab wrap inside the open detail: `showModal` already traps focus; this guarantees it where the webview browser does not. */
export function trapDetailTab(root: HTMLElement, event: KeyboardEvent): void {
  const controls = [...(root.querySelector('dialog.dlg')?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])];
  const active = root.ownerDocument.activeElement;
  const last = controls.at(-1);
  if (controls.length === 0) return;
  if (event.shiftKey && active === controls[0] && last) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    controls[0]?.focus();
  }
}

/** Arrows, Home and End move focus between the items of the open menu, in a loop. */
export function navigateMenu(root: HTMLElement, event: KeyboardEvent): void {
  const items = [...root.querySelectorAll<HTMLElement>('.menu [role="menuitem"]')];
  if (items.length === 0) return;
  const i = items.indexOf(root.ownerDocument.activeElement as HTMLElement);
  let target: number | undefined;
  if (event.key === 'ArrowDown') target = (i + 1) % items.length;
  else if (event.key === 'ArrowUp') target = i <= 0 ? items.length - 1 : i - 1;
  else if (event.key === 'Home') target = 0;
  else if (event.key === 'End') target = items.length - 1;
  if (target === undefined) return;
  event.preventDefault();
  items[target]?.focus();
}

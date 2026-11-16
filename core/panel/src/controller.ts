// The bound panel: holds the current state, runs the transitions the host and the user ask for, draws and saves.
// What changes the state lives in `state.ts`; what only touches the DOM, in `page-dom.ts`; the wiring, in `page.ts`.
import type { Strings } from '@plan-relay/i18n';
import { isHostMessage, type WebviewMessage } from './messages';
import { render, type Tab } from './render';
import { readSaved } from './saved';
import { clickOf, type Click, type LocalClick } from './click';
import * as S from './state';
import {
  focusSearch,
  focusSelector,
  ideaRowSelector,
  measureFilters,
  menuButtonCovered,
  menuButtonSelector,
  navigateMenu,
  navigateTree,
  onBackdrop,
  positionMenu,
  quote,
  restoreFocus,
  rove,
  rowSelector,
  searchSelection,
  tabForKey,
  trapDetailTab,
} from './page-dom';
import type { HostChannel } from './channel';

/** How long the search waits after the last key before it redraws and saves. */
export const SEARCH_DELAY_MS = 150;

/** The host actions that, from the detail, open something else: the detail closes. */
const CLOSES_DETAIL: ReadonlySet<WebviewMessage['type']> = new Set([
  'execute',
  'open',
  'giveUp',
  'reopen',
  'ideaRefine',
  'ideaMap',
  'ideaOpen',
]);

type LocalHandlers = { [K in LocalClick['type']]: (click: Extract<LocalClick, { type: K }>) => void };

export class PanelController {
  private state: S.PanelState;
  /** The last saved state, as JSON: a change that does not touch it saves nothing. */
  private lastSaved: string;
  /** After the next draw, focus goes to the first menu item (it has just opened). */
  private focusMenu = false;
  /** The focus the redraw restores is not valid (the detail opened, switched task or closed): the focus owner is another. */
  private ignoreFocus = false;
  /** Where focus returns when the detail closes: the row of the task it opened from (does not change when navigating from task to task). */
  private detailOrigin: string | undefined;
  /** The last tab reported to the host: clicking the tab that is already active does not repeat the report. */
  private noticedTab: Tab | undefined;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  /** What the redrawn HTML goes into; the live region sits beside it, so it outlives the redraw. */
  private content: HTMLElement | undefined;
  private live: HTMLElement | undefined;
  /** The texts marked `data-announce` in the last draw: only a new one is said. */
  private announced: readonly string[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly channel: HostChannel,
    private readonly strings: Strings,
    private readonly actionsInRow: boolean,
  ) {
    this.state = S.fromSaved(readSaved(channel.readSaved()));
    this.lastSaved = JSON.stringify(S.toSaved(this.state));
  }

  /** Draws what was saved, says it is ready and reports the tab. */
  start(): void {
    this.draw();
    this.channel.send({ type: 'ready' });
    this.flagTab();
  }

  /** Drops the pending search. */
  dispose(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = undefined;
  }

  /** A message from the host, still to be validated. */
  receive(m: unknown): void {
    if (!isHostMessage(m)) return;
    if (m.type === 'collapseAll') return this.collapseAll();
    if (m.type === 'filter') return focusSearch(this.root);
    const next = S.receive(this.state, m);
    // The detail of a task that disappeared from the plan closes (with no focus to return: the row disappeared too).
    if (this.state.detail !== undefined && next.detail === undefined) {
      this.detailOrigin = undefined;
      this.ignoreFocus = true;
    }
    this.update(next);
  }

  /** A click anywhere in the root. */
  click(event: MouseEvent): void {
    const el = event.target as Element | null;
    // Click on the darkened backdrop (the target is the <dialog> itself, outside its box): closes and returns focus to the row.
    if (this.state.detail !== undefined && el?.localName === 'dialog' && onBackdrop(el, event)) return this.closeDetail(true);
    const target = el?.closest<HTMLElement>('[data-action]');
    const click = target ? clickOf(target.dataset) : undefined;
    const insideMenu = this.state.menuOpen !== undefined && target?.closest('.menu') != null;
    // Click outside the open menu: closes it, and the click goes on its way (it may be on another button).
    if (this.state.menuOpen !== undefined && !el?.closest('.menu-wrap')) this.update({ ...this.state, menuOpen: undefined });
    if (!click) return;
    // Choosing a menu item closes it; the action goes on.
    if (insideMenu && click.type !== 'tab' && click.type !== 'menu') this.update({ ...this.state, menuOpen: undefined });
    this.dispatch(click);
  }

  /**
   * The search and the selectors (track and tier of Plans, plan of Now) go into the tab filters. A selector redraws
   * at once; the search waits for a pause in the typing, and the redraw restores focus and cursor.
   */
  fieldChanged(event: Event): void {
    const field = event.target as HTMLInputElement | HTMLSelectElement | null;
    const name = field?.dataset.field;
    if (!field || !S.isFieldName(name)) return;
    // During composition (accents, IME) the text is not valid yet: wait for `compositionend`.
    if (event.type === 'input' && (event as InputEvent).isComposing) return;
    const next = S.setField(this.state, name, field.value);
    if (name !== 'q' || event.type === 'change') return this.update(next);
    this.state = next;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.update(this.state), SEARCH_DELAY_MS);
  }

  /** The keyboard: the detail traps it; with the menu open, Esc and Tab close it and the arrows walk it; otherwise tabs and tree. */
  keydown(event: KeyboardEvent): void {
    if (this.state.detail !== undefined) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeDetail(true);
      } else if (event.key === 'Tab') trapDetailTab(this.root, event);
    } else if (this.state.menuOpen === undefined) {
      const tab = tabForKey(event);
      if (tab === undefined) return navigateTree(this.root, event);
      event.preventDefault();
      this.selectTab(tab, true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.closeMenu(true);
    } else if (event.key === 'Tab') this.closeMenu(false);
    else navigateMenu(this.root, event);
  }

  /** With the «⋯» menu open, scrolling until the button disappears under the bar or the strip closes the menu, like the VS Code ones. */
  scrolled(): void {
    if (this.state.menuOpen !== undefined && menuButtonCovered(this.root, this.state.menuOpen)) this.closeMenu(false);
  }

  /** Tells the host which tab is active: VS Code shows «Collapse all» in the title bar only for Plans. */
  private flagTab(): void {
    if (this.noticedTab === this.state.tab) return;
    this.noticedTab = this.state.tab;
    this.channel.send({ type: 'tab', tab: this.state.tab });
  }

  private draw(): void {
    const input = S.renderInput(this.state, this.strings, this.actionsInRow);
    if (!input) return;
    const { root } = this;
    const focus = this.ignoreFocus ? undefined : focusSelector(root);
    const selection = searchSelection(root);
    this.ignoreFocus = false;
    this.contentRoot().innerHTML = render(input);
    this.announce();
    measureFilters(root);
    positionMenu(root);
    // `showModal` traps focus in the popup, makes the rest inert and moves focus to the first control (the close button).
    const popup = this.state.detail ? root.querySelector<HTMLDialogElement>('dialog.dlg') : null;
    popup?.showModal();
    if (this.focusMenu) {
      this.focusMenu = false;
      root.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    } else if (focus) restoreFocus(popup ?? root, focus, selection);
  }

  /**
   * The redrawn part, created on the first draw next to a live region that stays: a region born together with the
   * content it announces is not read by many screen readers, and `innerHTML` would recreate it on every draw.
   */
  private contentRoot(): HTMLElement {
    if (this.content) return this.content;
    const doc = this.root.ownerDocument;
    this.content = doc.createElement('div');
    this.content.classList.add('content');
    this.live = doc.createElement('div');
    this.live.classList.add('live');
    this.live.setAttribute('role', 'status');
    this.live.setAttribute('aria-live', 'polite');
    this.live.setAttribute('aria-atomic', 'true');
    this.root.replaceChildren(this.content, this.live);
    return this.content;
  }

  /**
   * The drawn texts marked `data-announce` (host notices, the filter count, the environment footer) that were not in
   * the last draw go to the live region; a draw that brings nothing new empties it, so nothing is said twice.
   */
  private announce(): void {
    const texts = [...(this.content?.querySelectorAll('[data-announce]') ?? [])].map((e) => (e.textContent ?? '').trim());
    const fresh = texts.filter((t) => t !== '' && !this.announced.includes(t));
    this.announced = texts;
    if (this.live && this.live.textContent !== fresh.join(' ')) this.live.textContent = fresh.join(' ');
  }

  /** The new state is drawn, and saved when what outlives the view changed. A pending search is part of it. */
  private update(next: S.PanelState): void {
    this.dispose();
    this.state = next;
    const saved = S.toSaved(next);
    const text = JSON.stringify(saved);
    if (text !== this.lastSaved) {
      this.lastSaved = text;
      this.channel.save(saved);
    }
    this.draw();
  }

  private focus(selector: string): void {
    this.root.querySelector<HTMLElement>(selector)?.focus();
  }

  private openDetail(ref: S.TaskRef | S.IdeaRef): void {
    if (this.state.detail === undefined) this.detailOrigin = 'idea' in ref ? ideaRowSelector(ref.idea) : rowSelector(ref.plan, ref.id);
    this.ignoreFocus = true;
    this.update({ ...this.state, detail: 'idea' in ref ? { idea: ref.idea } : { plan: ref.plan, id: ref.id } });
  }

  /** Closes the detail; with `returnFocus`, focus returns to the row it opened from. */
  private closeDetail(returnFocus: boolean): void {
    if (this.state.detail === undefined) return;
    const origin = this.detailOrigin;
    this.detailOrigin = undefined;
    this.ignoreFocus = true;
    this.update({ ...this.state, detail: undefined });
    if (returnFocus && origin) this.focus(origin);
  }

  /** Selects a tab; with `focus`, focus goes to the new tab (arrows, Home and End move focus and select). */
  private selectTab(tab: Tab, focus = false): void {
    if (focus) this.ignoreFocus = true;
    this.update(S.selectTab(this.state, tab));
    this.flagTab();
    if (focus) this.focus(`[role="tab"][data-tab="${tab}"]`);
  }

  /** Closes the «⋯» menu and, if requested, returns focus to the button that opened it. */
  private closeMenu(returnFocus: boolean): void {
    const plan = this.state.menuOpen;
    if (plan === undefined) return;
    this.update({ ...this.state, menuOpen: undefined });
    if (returnFocus) this.focus(menuButtonSelector(plan));
  }

  /** «Collapse all» (view title bar or Plans header). */
  private collapseAll(): void {
    this.update(S.collapseAll(this.state));
    this.flagTab();
  }

  /** «Go» lands on the row of the task (or opens it in the detail, when the filters hide it). */
  private goTo(task: S.TaskRef): void {
    const go = S.goToTask(this.state, task);
    if (go.to === 'detail') this.openDetail(task);
    if (go.to !== 'row') return;
    this.detailOrigin = undefined;
    this.ignoreFocus = true;
    this.update(go.state);
    this.flagTab();
    const row = this.root.querySelector<HTMLElement>(rowSelector(task.plan, task.id));
    row?.focus();
    rove(row);
    row?.scrollIntoView({ block: 'nearest' });
  }

  /** Each click that stays in the page, by type: its transition, and what it does with focus. */
  private readonly local: LocalHandlers = {
    tab: (c) => this.selectTab(c.tab),
    menu: (c) => {
      const next = S.toggleMenu(this.state, c.plan);
      this.focusMenu = next.menuOpen !== undefined;
      this.update(next);
    },
    detail: (c) => this.openDetail(c),
    ideaDetail: (c) => this.openDetail(c),
    close: () => this.closeDetail(true),
    go: (c) => this.goTo(c),
    phase: (c) => this.update(S.togglePhase(this.state, c.plan, c.phase)),
    group: (c) => this.update(S.toggleGroup(this.state, c.plan, c.group)),
    nowSection: (c) => this.update(S.toggleNowSection(this.state, c.plan, c.group)),
    ideasSection: (c) => this.update(S.toggleIdeasSection(this.state, c.status)),
    ideaPlan: (c) => {
      // From the idea detail: the popup closes, and focus goes to the card of the plan.
      this.closeDetail(false);
      const go = S.goToIdeaPlan(this.state, c.plan);
      this.update(go.state);
      this.flagTab();
      if (go.id !== undefined) this.focus(`[data-action="toggle"][data-plan="${quote(go.id)}"]`);
    },
    chip: (c) => this.update(S.toggleChip(this.state, c)),
    ideaChip: (c) => this.update(S.toggleChip(this.state, c)),
    advanced: () => this.update(S.toggleAdvanced(this.state)),
    view: (c) => this.update(S.setView(this.state, c.view)),
    collapseAll: () => this.collapseAll(),
    clear: () => {
      this.update(S.clearFilters(this.state));
      this.focus('[data-field="q"]');
    },
    more: (c) => this.update(S.showMore(this.state, c.plan, c.phase)),
    toggle: (c) => this.update(S.toggleCard(this.state, c.plan)),
  };

  /** A click that stays in the page goes to its transition; the rest goes to the host. */
  private dispatch(click: Click): void {
    if (click.type in this.local) return (this.local[click.type as LocalClick['type']] as (c: Click) => void)(click);
    const message = click as WebviewMessage;
    if (message.type === 'refresh') {
      if (this.state.loading) return;
      // Immediate answer to the click; the host confirms with «loading» when the read starts and ends.
      this.update({ ...this.state, loading: true });
    }
    // An action from the detail that opens something (the agent, the file, the host confirmation): the popup gets out of
    // the way and focus stays with whatever the action opens.
    if (CLOSES_DETAIL.has(message.type)) this.closeDetail(false);
    this.channel.send(message);
  }
}

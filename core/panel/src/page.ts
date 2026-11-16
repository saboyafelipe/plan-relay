// The panel page script, without a host: it draws the incoming status and turns clicks into messages.
// The host provides the channel (transport of the messages and where to keep the page state); in the extension it is
// the webview `acquireVsCodeApi()`, in another host it is whatever it has.
import type { HostChannel } from './channel';
import type { Tab } from './render';
import type { Filters } from './filter';
import { PanelController } from './controller';
import { measureFilters, rove, showChip, focusSearch } from './page-dom';
import { stringsFor, type Strings } from '@plan-relay/i18n';

export type { Tab, Filters };
export { readSaved, SAVED_VERSION, type Saved, type FiltersByTab, type TasksView } from './saved';
export { clickOf, type Click } from './click';
export { SEARCH_DELAY_MS } from './controller';
export type { HostChannel } from './channel';

/** What the host says about the page when binding it. */
export interface PanelOptions {
  /**
   * The tab row draws «Collapse all», the plugin status and «Refresh» (default: yes). A host with its own title
   * bar (VS Code) takes them there and passes `false`; a host without its own title bar (the ZCode desktop app,
   * see ARCHITECTURE.md) leaves them in the panel.
   */
  actionsInRow?: boolean;
}

/** The bound page. */
export interface PanelBinding {
  /** Removes every listener the page added (to the root, the document, the window and the channel) and the pending search. */
  dispose(): void;
}

/**
 * Binds the page: draws what was saved (in the language of `strings`, English without them), listens to the host,
 * the clicks, the fields and the keyboard, and says it is ready. The state and its transitions live in the controller;
 * here each event is wired to it, and `dispose` unwires them all.
 */
export function bindPanel(
  root: HTMLElement,
  channel: HostChannel,
  strings: Strings = stringsFor(),
  options: PanelOptions = {},
): PanelBinding {
  const panel = new PanelController(root, channel, strings, options.actionsInRow ?? true);
  const removers: (() => void)[] = [];
  function listen<E extends Event>(target: EventTarget | null | undefined, type: string, handle: (event: E) => void): void {
    if (!target) return;
    const listener = (event: Event): void => handle(event as E);
    target.addEventListener(type, listener);
    removers.push(() => target.removeEventListener(type, listener));
  }

  const off = channel.onReceive((m) => panel.receive(m));
  if (off) removers.push(off);
  listen<MouseEvent>(root, 'click', (event) => panel.click(event));
  for (const type of ['input', 'change', 'compositionend']) listen(root, type, (event) => panel.fieldChanged(event));
  listen<KeyboardEvent>(root, 'keydown', (event) => panel.keydown(event));
  listen(root, 'focusin', (event) => {
    // The tree item with focus becomes the Tab stop, and the focused chip comes fully into view.
    rove(event.target as Element | null);
    showChip(event.target as Element | null);
  });
  const view = root.ownerDocument.defaultView;
  // Changing the view width breaks the chips into more or fewer rows: measure again, without redrawing.
  listen(view, 'resize', () => measureFilters(root));
  listen(view, 'scroll', () => panel.scrolled());
  // ⌘F / Ctrl+F anywhere in the document focuses the search of the active tab.
  listen<KeyboardEvent>(root.ownerDocument, 'keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      focusSearch(root);
    }
  });

  panel.start();
  return {
    dispose() {
      panel.dispose();
      for (const remove of removers.splice(0)) remove();
    },
  };
}

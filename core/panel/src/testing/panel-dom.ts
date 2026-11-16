// The panel bound to a real DOM (happy-dom in the tests): a root in the document, a recording channel, and
// helpers that act like the user does — a click on what was drawn, a key on what has focus, typing in a field.
import type { WebviewMessage } from '../messages';
import { bindPanel, SAVED_VERSION, type HostChannel, type PanelOptions, type Saved } from '../page';
import { stringsFor } from '@plan-relay/i18n';

export interface MountedPanel {
  /** The root the panel draws into, attached to `document.body`. */
  root: HTMLElement;
  /** What the panel sent to the host, in order. */
  sent: WebviewMessage[];
  /** Every state the panel saved, in order. */
  savedList: Saved[];
  /** Unbinds the panel (`PanelBinding.dispose`). */
  dispose(): void;
  /** Delivers a message from the host. */
  receive(message: unknown): void;
  /**
   * The drawn element with these `data-*` (`{ action: 'toggle', plan }` → `[data-action="toggle"][data-plan="…"]`), inside
   * `scope` (by default, the root); throws when absent.
   */
  control(data: Record<string, string>, scope?: ParentNode): HTMLElement;
  /** Whether something with these `data-*` is drawn. */
  has(data: Record<string, string>): boolean;
  /** A real click on the drawn element with these `data-*`, or on the element given. */
  click(target: Record<string, string> | Element): void;
  /** A `keydown` that bubbles from `target` (by default, the element with focus); returns whether the panel took it (`preventDefault`). */
  key(key: string, init?: KeyboardEventInit, target?: Element): boolean;
  /** Types in (`input`) or chooses in (`change`) the field with this `data-field`. */
  type(field: string, value: string, kind?: 'input' | 'change'): void;
}

/** HTML from `render` as a DOM attached to the document, to query by role and by attribute rather than by attribute order. */
export function parseHtml(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.replaceChildren(root);
  return root;
}

/** The element of `html` that matches `selector`; throws when there is none. */
export function elementOf(html: string, selector: string): HTMLElement {
  const el = parseHtml(html).querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`nothing in the HTML matches ${selector}`);
  return el;
}

/** An attribute of the element of `html` that matches `selector`. */
export function attributeOf(html: string, selector: string, name: string): string | null {
  return elementOf(html, selector).getAttribute(name);
}

/** Whether some element of `html` matches `selector`, whatever the order of its attributes. */
export function hasElement(html: string, selector: string): boolean {
  return parseHtml(html).querySelector(selector) !== null;
}

/** The text of the element of `html` that matches `selector`. */
export function textOf(html: string, selector: string): string {
  return elementOf(html, selector).textContent ?? '';
}

/** The selector of a drawn element by its `data-*`, in the order given. */
export function byData(data: Record<string, string>): string {
  const quoted = (v: string): string => v.replace(/["\\]/g, '\\$&');
  return Object.entries(data)
    .map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${quoted(v)}"]`)
    .join('');
}

/**
 * Binds the panel to a fresh root with `saved` as the state the host kept. A saved object without `version` is taken
 * as written by this page (it gets the current version); to hand the page a state of another version, give `version`.
 */
export function mountPanel(saved?: unknown, options?: PanelOptions): MountedPanel {
  document.body.replaceChildren();
  const root = document.createElement('div');
  document.body.append(root);
  const sent: WebviewMessage[] = [];
  const savedList: Saved[] = [];
  let receive: (m: unknown) => void = () => {};
  const kept = typeof saved === 'object' && saved !== null && !('version' in saved) ? { version: SAVED_VERSION, ...saved } : saved;
  const channel: HostChannel = {
    send: (m) => sent.push(m),
    onReceive: (f) => {
      receive = f;
      return () => {
        receive = () => {};
      };
    },
    readSaved: () => kept,
    save: (g) => savedList.push(g),
  };
  // The tests read the pt-BR texts; the panel's own fallback is English.
  const binding = bindPanel(root, channel, stringsFor('pt-BR'), options);
  const control = (data: Record<string, string>, scope: ParentNode = root): HTMLElement => {
    const el = scope.querySelector<HTMLElement>(byData(data));
    if (!el) throw new Error(`nothing drawn matches ${byData(data)}`);
    return el;
  };
  return {
    root,
    sent,
    savedList,
    dispose: () => binding.dispose(),
    receive: (m) => receive(m),
    control,
    has: (data) => root.querySelector(byData(data)) !== null,
    click(target) {
      const el = target instanceof Element ? target : control(target);
      (el as HTMLElement).click();
    },
    key(key, init = {}, target) {
      const from = target ?? document.activeElement ?? root;
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
      from.dispatchEvent(event);
      return event.defaultPrevented;
    },
    type(field, value, kind = 'input') {
      const el = control({ field }) as HTMLInputElement | HTMLSelectElement;
      if (el instanceof HTMLSelectElement && ![...el.options].some((o) => o.value === value))
        throw new Error(`${field} has no option ${value}`);
      el.value = value;
      el.dispatchEvent(new Event(kind, { bubbles: true }));
    },
  };
}

// The top of the panel and the tab row: plugin status and host notices, the Now, Plans and Ideas tabs with their actions, and the
// environment footer at the bottom.
import { stringsFor, type Strings } from '@plan-relay/i18n';
import type { NowFilters, IdeasFilters } from './filter';
import { icon } from './icons';
import { TABS, type EnvironmentInput, type PluginView, type Tab } from './types';
import { environmentView } from './footer';
import { button, escapeHtml } from './util';

/** The filters of the Now and Ideas tabs and the open advanced part, which the page keeps; the Plans ones go in `filters`. */
export interface TabBar {
  now?: NowFilters;
  ideas?: IdeasFilters;
  advanced?: boolean;
}

/**
 * The tab row (WAI-ARIA «Tabs» pattern): a `tablist` with one `tab` per tab (icon, label, counter), only the
 * selected one in the Tab order (`tabindex` 0). The three control the same `tabpanel`, which carries the body of the active tab. The actions
 * (`action`, HTML: «Collapse all», status and «Refresh») stay outside the `tablist`, on the right: a button that is not a tab cannot be inside it.
 * `aria-busy` marks the row busy during the read or the install.
 */
export function tabRow(
  active: Tab,
  labels: Record<Tab, string>,
  counters: Record<Tab, number>,
  ofOwner: number,
  action: string,
  busy: boolean,
  x: Strings,
): string {
  const tabs = TABS.map((a) => {
    const sel = a === active;
    // The Now counter with an owner task gets the highlight and says how many are waiting for you: in the tooltip
    // for the pointer, and in hidden text for a screen reader, which reads neither the colour nor the title.
    const owner = escapeHtml(x.t('tabs.ofOwner', ofOwner));
    const counter =
      a === 'now' && ofOwner > 0
        ? `<span class="counter owner" title="${owner}">${counters[a]}<span class="vh">, ${owner}</span></span>`
        : `<span class="counter">${counters[a]}</span>`;
    const role = `role="tab" id="tab-${a}" class="tab" data-action="tab" data-tab="${a}" aria-selected="${sel}" aria-controls="tab-panel"`;
    const attributes = `${role} tabindex="${sel ? 0 : -1}" title="${escapeHtml(`${labels[a]} (${counters[a]})`)}"`;
    return button(attributes, `${icon(a)}<span class="tab-label">${escapeHtml(labels[a])}</span>${counter}`);
  }).join('');
  return `<div class="tabs" aria-busy="${busy}"><div class="tabs-list" role="tablist" aria-label="${escapeHtml(x.t('tabs.label'))}">${tabs}</div>${action}</div>`;
}

/** «Refresh» only as an icon: the label goes in the `aria-label`; during a read it is disabled and the icon spins. */
export function refreshButton(toLoad: boolean, x: Strings): string {
  const label = escapeHtml(x.t('panel.refresh'));
  const tooltip = toLoad ? escapeHtml(x.t('panel.refreshing')) : label;
  return `<button type="button" class="ib tabs-action" data-action="refresh" aria-label="${label}" title="${tooltip}"${toLoad ? ' disabled' : ''}>${icon('refresh')}</button>`;
}

/** What the plugin says about itself: the status text, the button the status asks for (install) and whether something asks for the owner's action. */
export function pluginStatus(plugin: PluginView | undefined, x: Strings): { text: string; button: string; asksAction: boolean } {
  const p = plugin ?? { state: 'checking' as const };
  let text: string;
  let installButton = '';
  switch (p.state) {
    case 'checking':
      text = x.t('plugin.checking');
      break;
    case 'installing':
      text = x.t('plugin.installing');
      // The button stays where «Install» was, disabled: the install takes seconds and the click has to be seen.
      installButton = `<button type="button" class="action" data-action="install" disabled>${escapeHtml(x.t('plugin.installingButton'))}</button>`;
      break;
    case 'active-project':
    case 'active-user':
      text = x.t('plugin.active', x.t(`scope.${p.scope}`));
      break;
    case 'inactive':
      text = x.t('plugin.inactive', x.t(`scope.${p.scope}`));
      break;
    case 'not-installed':
      text = x.t('plugin.notInstalled');
      installButton = `<button type="button" class="action" data-action="install">${escapeHtml(x.t('plugin.install'))}</button>`;
      break;
    case 'error':
      text = x.t('plugin.error', p.error);
      break;
  }
  if ('newVersion' in p && p.newVersion) text += ` · ${x.t('plugin.newVersion', p.newVersion.registered, p.newVersion.folder)}`;
  const active = p.state === 'active-project' || p.state === 'active-user';
  // Only an up-to-date plugin, with no new version in the folder, asks for nothing; the rest keeps the text line.
  return { text, button: installButton, asksAction: !(active && !('newVersion' in p && p.newVersion)) };
}

/**
 * The plugin status and the time of the last read on one line, as plain text: the ⓘ tooltip in the panel and, in the host with its own title
 * bar, what the plugin status command shows.
 */
export function statusText(plugin: PluginView | undefined, updated: string | undefined, strings: Strings = stringsFor()): string {
  const text = pluginStatus(plugin, strings).text;
  // Before the first read there is no time: only the status.
  return updated === undefined ? text : `${text} · ${strings.t('panel.updatedAt', updated)}`;
}

/** The states of the plugin line that a screen reader is told when they appear: the install under way and an error. */
const ANNOUNCED_PLUGIN_STATES: ReadonlySet<PluginView['state']> = new Set(['installing', 'error']);

/** The plugin line: the status and, when not installed, «Install». */
export function pluginRow(plugin: PluginView | undefined, text: string, button: string): string {
  const state = (plugin ?? { state: 'checking' }).state;
  const announce = ANNOUNCED_PLUGIN_STATES.has(state) ? ' data-announce' : '';
  return `<div class="plugin plugin-${state}"><span class="plugin-status"${announce}>${escapeHtml(text)}</span>${button}</div>`;
}

/**
 * The environment footer: the required one that is missing (warning) and the optional one that asks for attention (note), by id, and where
 * the detail is. With no environment yet, or nothing pending, there is no footer.
 */
export function footer(environment: EnvironmentInput | undefined, x: Strings): string {
  if (!environment) return '';
  const { missing, attention } = environmentView(environment);
  if (missing.length === 0 && attention.length === 0) return '';
  const lines = [
    missing.length ? `<p class="environment-missing">${escapeHtml(x.t('footer.missing', missing.join(', ')))}</p>` : '',
    attention.length ? `<p class="environment-note">${escapeHtml(x.t('footer.attention', attention.join(', ')))}</p>` : '',
    `<p class="environment-hint">${escapeHtml(x.t('footer.hint'))}</p>`,
  ];
  return `<footer class="environment" data-announce>${lines.join('')}</footer>`;
}

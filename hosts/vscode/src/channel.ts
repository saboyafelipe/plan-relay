// The internal codes that reach the «Plan Relay» output channel: the load reason, the plugin state, the webview
// message type, the origin of the binary and of the marketplace source, the action name and how it ended. The
// program uses English codes; the channel writes each one through the `channel.` area of core/i18n, whose English
// text is the code itself and whose pt-BR text is the Portuguese code the log has always shown. A camelCase code
// (a webview message type such as `giveUp`) is looked up in kebab-case. A code without a key is written as is.
import ptBR from '@plan-relay/i18n/pt-BR.json';
import { stringsFor, type Key, type Strings } from '@plan-relay/i18n';
import type { PluginView } from '@plan-relay/panel';

/** The code as the channel writes it in the language of `strings`. */
export function inChannel(code: string, strings: Strings = stringsFor()): string {
  const key = `channel.${code.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
  return key in ptBR ? strings.t(key as Key) : code;
}

/** The channel line for a plugin state reading: the state, the new version and the error. */
export function pluginLine(status: PluginView, strings: Strings = stringsFor()): string {
  const detail = status.state === 'error' ? ` — ${status.error}` : '';
  const newVersionNotice =
    'newVersion' in status && status.newVersion ? strings.t('log.newVersion', status.newVersion.registered, status.newVersion.folder) : '';
  return `plugin: ${inChannel(status.state, strings)}${newVersionNotice}${detail}`;
}

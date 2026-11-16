// Opens Claude Code with a prompt in the text box, without sending it. Three paths, in order:
// the official extension's command (opens without asking), its URI (VS Code asks for confirmation)
// and, if neither worked, the clipboard with a notification saying where to paste.
import type * as vscode from 'vscode';
import { stringsFor, type Strings } from '@plan-relay/i18n';
import { copiedMessage } from '../provider';
import { errorMessage } from '../../util';

export type OpenPath = 'command' | 'uri' | 'copied';

export const CLAUDE_EXTENSION = 'anthropic.claude-code';
/** `(sessionId, initialPrompt)`: the prompt goes into the box of a new tab, without being sent. */
export const CLAUDE_COMMAND = 'claude-vscode.editor.open';
export const AGENT_NAME = 'Claude Code';
/** The short name: the binary's, and the prefix of the output channel lines (core/i18n strings receive it as an argument). */
export const SHORT_NAME = 'claude';
/** The official extension does not load in a workspace in restricted mode (`untrustedWorkspaces.supported: false`). */
export function restrictedMessage(strings: Strings = stringsFor()): string {
  return strings.t('provider.restricted', AGENT_NAME);
}

/** The parts of a `vscode.Uri`; the query is already encoded and is used as is. */
export interface UriParts {
  scheme: string;
  authority: string;
  path: string;
  query: string;
}

export interface OpenDeps {
  executeCommand(command: string, ...args: unknown[]): PromiseLike<unknown>;
  /** Without the official extension VS Code accepts the URI anyway (returns `true`) and offers to install it. */
  extensionInstalled(): boolean;
  /** `workspace.isTrusted`: in restricted mode the official extension does not load. */
  trustedWorkspace(): boolean;
  openUri(parts: UriParts): PromiseLike<boolean>;
  copy(text: string): PromiseLike<void>;
  /** Shows a notification; the user is not expected to dismiss it. */
  alert(text: string): unknown;
  channel: { info(text: string): void; warn(text: string): void };
  /** The language of the notices and the output channel (English without it). */
  strings?: Strings;
}

/**
 * URI the official extension treats as "open with this prompt". It reads the query with
 * `URLSearchParams`, so the prompt goes through `encodeURIComponent` (which encodes `&`, `=`, `+`, `#`).
 */
export function promptUri(prompt: string): UriParts {
  return { scheme: 'vscode', authority: CLAUDE_EXTENSION, path: '/open', query: `prompt=${encodeURIComponent(prompt)}` };
}

function uriText(u: UriParts): string {
  return `${u.scheme}://${u.authority}${u.path}?${u.query}`;
}

/**
 * Opens Claude Code with `prompt` and returns the path that resulted; each attempt leaves a line
 * in the output channel. Rejects only if the copy to the clipboard itself fails.
 */
export async function openClaude(prompt: string, deps: OpenDeps): Promise<OpenPath> {
  const { channel } = deps;
  const strings = deps.strings ?? stringsFor();
  const { t } = strings;
  try {
    await deps.executeCommand(CLAUDE_COMMAND, undefined, prompt);
    channel.info(t('log.providerCommandOk', SHORT_NAME));
    return 'command';
  } catch (error) {
    channel.warn(t('log.providerCommandFailed', SHORT_NAME, errorMessage(error)));
  }

  if (!deps.extensionInstalled()) {
    channel.info(t('log.providerUriSkipped', SHORT_NAME, CLAUDE_EXTENSION));
  } else {
    const parts = promptUri(prompt);
    try {
      if (await deps.openUri(parts)) {
        channel.info(t('log.providerUriAccepted', SHORT_NAME, uriText(parts)));
        return 'uri';
      }
      channel.warn(t('log.providerUriRefused', SHORT_NAME, uriText(parts)));
    } catch (error) {
      channel.warn(t('log.providerUriFailed', SHORT_NAME, errorMessage(error)));
    }
  }

  await deps.copy(prompt);
  channel.info(t('log.providerPromptCopied', SHORT_NAME));
  const restricted = !deps.trustedWorkspace();
  if (restricted) channel.warn(t('log.providerRestricted', SHORT_NAME));
  void deps.alert(restricted ? restrictedMessage(strings) : copiedMessage(AGENT_NAME, strings));
  return 'copied';
}

/** The real dependencies. `Uri.from` keeps the query as it comes, without decoding it. */
export function vscodeDeps(api: typeof vscode, channel: OpenDeps['channel'], strings: Strings = stringsFor()): OpenDeps {
  return {
    strings,
    executeCommand: (command, ...args) => api.commands.executeCommand(command, ...args),
    extensionInstalled: () => api.extensions.getExtension(CLAUDE_EXTENSION) !== undefined,
    trustedWorkspace: () => api.workspace.isTrusted,
    openUri: (parts) => api.env.openExternal(api.Uri.from(parts)),
    copy: (text) => api.env.clipboard.writeText(text),
    alert: (text) => api.window.showInformationMessage(strings.t('notice.brand', text)),
    channel,
  };
}

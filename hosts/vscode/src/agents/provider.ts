// The agent provider: everything the extension knows about a concrete agent — detecting it, reading and changing
// the plugin installation, opening it with a prompt and building the prompt for each action — sits behind this
// interface. The rest of the extension talks only to it. It starts with the Claude Code provider; another agent's
// provider (see ARCHITECTURE.md) may not know how to install or open: then the panel says what to do and copies
// the prompt.
import { basename } from 'node:path';
import { stringsFor, type Strings } from '@plan-relay/i18n';
import type { Check } from '@plan-relay/reader';
import type { PluginScope, PluginState, PluginView } from '@plan-relay/panel';

/**
 * What the panel asks of the agent. `map`: the `.md` to map (a general plan or an idea), relative to the workspace
 * folder (with `/`). `refine`: the idea file to refine, with the same relative path. `plan`: the plan folder under
 * `agent_plans/` and the task ID. `run`: the plan folder under `agent_plans/`. `idea`: create a new idea, with no
 * argument; the agent asks for the subject.
 */
export type AgentAction = { map: string } | { refine: string } | { plan: string; id: string } | { run: string } | { idea: true };

/** How the prompt reached the agent: through a provider path, or copied to the clipboard. */
export type OpenPath = string;

export type InstallOutcome = { ok: true; message: string } | { ok: false; error: string };

/**
 * Where the plugin would be installed from. `workspace` is the open folder itself, which brings its own hooks and
 * scripts: the panel asks a "yes" of its own before using it. Any origin but `default` is shown when asking the scope.
 */
export interface InstallSource {
  source: string;
  origin: 'configured' | 'workspace' | 'known' | 'default';
}

/** A scope where the provider knows how to install the plugin, with the choice's text. */
export interface InstallScope {
  scope: 'project' | 'user';
  label: string;
  descriptionText: string;
}

export interface Provider {
  /** The agent's name in messages to the user ("Claude Code"). */
  readonly name: string;
  /**
   * The provider installs the plugin by itself (`install` and `uninstall` work). When `false`, the panel does
   * not offer to install: it says `howToInstall` and moves on.
   */
  readonly automatedInstall: boolean;
  /** What to tell the user when the installation cannot be automated or failed. */
  readonly howToInstall: string;
  /** The installation scopes, in the order of the choice. Empty when the installation cannot be automated. */
  readonly scopes: readonly InstallScope[];
  /**
   * The agent's configuration files, relative to the workspace folder, whose change may change the installation
   * state; the panel watches them and rereads the state.
   */
  readonly watchedSettings: readonly string[];
  /** The agent is present in this editor (its extension, the binary). */
  detect(): boolean;
  /** The plugin state for the given workspace folder. Does not reject: a problem comes as `state: 'error'`. */
  installState(folder: string): Promise<PluginState>;
  /** Where `install` would take the plugin from, for the folder. Optional: without it, nothing is shown or asked. */
  installSource?(folder: string): Promise<InstallSource>;
  /** Installs from `source` when given (the one the user confirmed), otherwise from where `installSource` says. */
  install(folder: string, scope: 'project' | 'user', source?: InstallSource): Promise<InstallOutcome>;
  uninstall(folder: string, scope: PluginScope): Promise<InstallOutcome>;
  /**
   * Opens the agent with the prompt in the box, without sending it, and returns the path that worked. Optional:
   * without it, the panel copies the prompt and says so.
   */
  openWithPrompt?(prompt: string): Promise<OpenPath>;
  /** The prompt for each action, in the syntax of this agent's skills (the prefix belongs to the provider). */
  prompt(action: AgentAction): string;
  /**
   * This agent's environment checks, in the shape of `check.sh --json` and with the ids and `required` of the
   * adapter's check-agent.sh; they come after the general ones. `plugin` is the state the panel already read,
   * so the agent is not asked again. Optional: without it, the footer shows only the general ones.
   */
  checksList?(folder: string, plugin: PluginView | undefined): Promise<Check[]>;
}

/**
 * The provider the panel talks to: the first whose agent is present in this editor; with none, the first in the
 * list (the default), which still builds the prompt and reads the installation. `undefined` only with an empty list.
 */
export function activeProvider<P extends Pick<Provider, 'detect'>>(providers: readonly P[]): P | undefined {
  return providers.find((p) => p.detect()) ?? providers[0];
}

export const COPIED = 'copied';

export interface CopyDeps {
  copy(text: string): PromiseLike<void>;
  /** Shows a notification; the user is not expected to dismiss it. */
  alert(text: string): unknown;
  channel: { info(text: string): void };
  /** The language of the notice and the output channel (English without it). */
  strings?: Strings;
}

/** The notification text when the prompt was copied instead of opened in the agent. */
export function copiedMessage(name: string, strings: Strings = stringsFor()): string {
  return strings.t('agent.copied', name);
}

/**
 * Opens the agent with the prompt through the provider; a provider that cannot open (or none) makes the panel copy
 * the prompt to the clipboard and say so.
 */
export async function openWithPrompt(
  provider: Pick<Provider, 'name' | 'openWithPrompt'> | undefined,
  prompt: string,
  deps: CopyDeps,
): Promise<OpenPath> {
  if (provider?.openWithPrompt) return provider.openWithPrompt(prompt);
  const strings = deps.strings ?? stringsFor();
  const { t } = strings;
  await deps.copy(prompt);
  deps.channel.info(provider ? t('log.agentCannotOpen', provider.name) : t('log.agentNoProvider'));
  void deps.alert(provider ? copiedMessage(provider.name, strings) : t('agent.copiedWithoutAgent'));
  return COPIED;
}

/**
 * The agent's session opens in the first workspace folder. A plan in another folder has the prompt's paths outside
 * it — the user is told, without being blocked.
 */
export function otherFolderNotice(
  name: string,
  planFolder: string,
  folders: readonly string[],
  strings: Strings = stringsFor(),
): string | undefined {
  const first = folders[0];
  if (folders.length < 2 || first === undefined || planFolder === first) return undefined;
  return strings.t('agent.otherFolder', name, basename(first), basename(planFolder));
}

// Messages between the host (extension, app) and the panel page, in both directions. The names belong
// to the panel domain; the host is what connects each message to a command, to the agent or to the transport.
import type { IdeasView, PlanView } from './view';
import { isIdeasView, isPlanView } from './shape';
import { TABS, type CheckInput, type EnvironmentInput, type PluginView, type Tab } from './types';
import { isRecord } from './util';

export type { PluginScope, PluginState, PluginView, CheckStatus, CheckInput, EnvironmentInput } from './types';

/** Extension → webview: the plans to show and the local time («HH:MM») of the read. */
export interface StatusMessage {
  type: 'status';
  plans: PlanView[];
  updated: string;
  /** The «Ideas» section; without it, or without items, the section does not appear. */
  ideas?: IdeasView;
}

/** Extension → webview: a read of the plans started (`active`) or finished. */
export interface LoadingMessage {
  type: 'loading';
  active: boolean;
}

const PLUGIN_STATES = new Set(['active-project', 'active-user', 'inactive', 'not-installed', 'error', 'checking', 'installing']);

/** Extension → webview: the plugin state for the workspace folder; it arrives apart from the plans. */
export interface PluginMessage {
  type: 'plugin';
  plugin: PluginView;
}

/** Extension → webview: the environment checks, for the footer. */
export interface EnvironmentMessage {
  type: 'environment';
  environment: EnvironmentInput;
}

/**
 * Extension → webview: host notices at the top, below the plugin state, already in the language text (for
 * example, the installed extension is older than the one in the open repository). The whole list replaces the previous one; empty, it disappears.
 */
export interface NoticesMessage {
  type: 'notices';
  notices: string[];
}

/** Extension → webview: the «Collapse all» command of the title bar; the page closes the phases of every plan. */
export interface CollapseAllMessage {
  type: 'collapseAll';
}

/** Extension → webview: the «Filter» command of the title bar and the shortcut; the page moves focus to the search field. */
export interface FilterMessage {
  type: 'filter';
}

export type HostMessage =
  StatusMessage | LoadingMessage | PluginMessage | EnvironmentMessage | NoticesMessage | CollapseAllMessage | FilterMessage;

const CHECK_STATUSES = new Set(['ok', 'missing', 'warning', 'unknown']);

function isCheck(x: unknown): x is CheckInput {
  if (!isRecord(x)) return false;
  return (
    typeof x.id === 'string' &&
    typeof x.status === 'string' &&
    CHECK_STATUSES.has(x.status) &&
    typeof x.required === 'boolean' &&
    typeof x.detail === 'string'
  );
}

function isEnvironment(x: unknown): x is EnvironmentInput {
  return isRecord(x) && typeof x.ok === 'boolean' && Array.isArray(x.checks) && x.checks.every(isCheck);
}

/** Validates what the extension sends to the webview, down to each plan and idea; the webview ignores the rest. */
export function isHostMessage(m: unknown): m is HostMessage {
  if (!isRecord(m)) return false;
  switch (m.type) {
    case 'status':
      return (
        Array.isArray(m.plans) &&
        m.plans.every(isPlanView) &&
        typeof m.updated === 'string' &&
        (m.ideas === undefined || isIdeasView(m.ideas))
      );
    case 'loading':
      return typeof m.active === 'boolean';
    case 'plugin':
      return isRecord(m.plugin) && typeof m.plugin.state === 'string' && PLUGIN_STATES.has(m.plugin.state);
    case 'environment':
      return isEnvironment(m.environment);
    case 'notices':
      return Array.isArray(m.notices) && m.notices.every((a) => typeof a === 'string');
    case 'collapseAll':
    case 'filter':
      return true;
    default:
      return false;
  }
}

/** Webview → extension. `plan` is the `id` of the `PlanView`; `file` is relative to the plan folder. */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'install' }
  | { type: 'open'; plan: string; file: string }
  | { type: 'delete'; plan: string }
  | { type: 'execute'; plan: string; id: string }
  /** Give up a task and reopen a give-up: the host rereads the plan, shows the graph, asks for the reason and writes it. */
  | { type: 'giveUp'; plan: string; id: string }
  | { type: 'reopen'; plan: string; id: string }
  | { type: 'run'; plan: string }
  /** Copy the run command of the plan (or, with `id`, the one of the task); the text comes from the host, not from the page. */
  | { type: 'copy'; plan: string; id?: string }
  /** The actions of the «Ideas» section; `idea` is the `id` of the `IdeaView` (the file). */
  | { type: 'ideaRefine'; idea: string }
  | { type: 'ideaMap'; idea: string }
  | { type: 'ideaOpen'; idea: string }
  /** The ideas folder card: «New idea» opens the agent with the idea skill; «Open folder» shows agent_plans/_ideas/. */
  | { type: 'ideaNew' }
  | { type: 'ideaFolder' }
  /** The active tab, on bind and on every change: the host shows in its bar only the actions that apply to it. */
  | { type: 'tab'; tab: Tab };

const PAGE_TABS: readonly unknown[] = TABS;

function nonEmptyText(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}

/** Validates what the webview sends; anything that is not one of these shapes is refused. */
export function isWebviewMessage(m: unknown): m is WebviewMessage {
  if (!isRecord(m)) return false;
  switch (m.type) {
    case 'ready':
    case 'refresh':
    case 'install':
    case 'ideaNew':
    case 'ideaFolder':
      return true;
    case 'open':
      return nonEmptyText(m.plan) && nonEmptyText(m.file);
    case 'delete':
    case 'run':
      return nonEmptyText(m.plan);
    case 'execute':
    case 'giveUp':
    case 'reopen':
      return nonEmptyText(m.plan) && nonEmptyText(m.id);
    case 'copy':
      return nonEmptyText(m.plan) && (m.id === undefined || nonEmptyText(m.id));
    case 'ideaRefine':
    case 'ideaMap':
    case 'ideaOpen':
      return nonEmptyText(m.idea);
    case 'tab':
      return PAGE_TABS.includes(m.tab);
    default:
      return false;
  }
}

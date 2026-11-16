// What the page keeps between reappearances, and how it reads it back. The host stores it as it is and hands it back
// from any version of the page; the version says whether the host data in it still has the shape the page draws.
import { isHostMessage, type EnvironmentInput, type PluginView, type StatusMessage } from './messages';
import type { TaskGroup } from './input';
import { EMPTY_NOW_FILTERS, EMPTY_IDEAS_FILTERS, type IdeaState, type Filters, type NowFilters, type IdeasFilters } from './filter';
import { TABS, type Tab } from './types';
import { recordOf } from './util';

/**
 * The shape of the saved state. Raise it when the shape of a saved field changes, and teach `readSaved` to carry
 * the fields of the version before over (or let them go); a saved state of a version it does not know is dropped.
 */
export const SAVED_VERSION = 3;

/** The search and the chips of each tab, kept apart: switching tabs does not touch the filter of the others. */
export interface FiltersByTab {
  now: NowFilters;
  plans: Filters;
  ideas: IdeasFilters;
}

/** How the task list is grouped: by phase or by status. */
export type TasksView = 'phase' | 'status';

/** What the page keeps between reappearances (open cards, last status, plugin, environment, host notices, and the panel v2 UI state). */
export interface Saved {
  version: typeof SAVED_VERSION;
  expanded: string[];
  /** The selected tab; a saved state from before the tabs (with `closedSections`) opens on Plans. */
  tab: Tab;
  /** Per plan (`PlanView.id`), the `dir` of the phases open in the accordion. */
  openPhases: Record<string, string[]>;
  /** Per tab; a saved state from before, with `filters` only for Plans, becomes the Plans ones. */
  filters: FiltersByTab;
  /** The advanced part of the bar (funnel) is open; it closes when the tab changes. */
  advanced: boolean;
  view: TasksView;
  /** Per list (phase or group), how many tasks are shown; absent is the first page. */
  pages: Record<string, number>;
  last?: StatusMessage | undefined;
  plugin?: PluginView | undefined;
  environment?: EnvironmentInput | undefined;
  notices?: string[];
}

const GROUPS: readonly TaskGroup[] = ['in-progress', 'available', 'owner', 'blocked', 'draft', 'done', 'cancelled', 'abandoned', 'invalid'];

export function isGroup(x: unknown): x is TaskGroup {
  return typeof x === 'string' && (GROUPS as readonly string[]).includes(x);
}

const IDEA_STATES: readonly IdeaState[] = ['open', 'refining', 'ready', 'mapped', 'invalid'];

export function isIdeaState(x: unknown): x is IdeaState {
  return typeof x === 'string' && (IDEA_STATES as readonly string[]).includes(x);
}

export function isTab(x: unknown): x is Tab {
  return typeof x === 'string' && (TABS as readonly string[]).includes(x);
}

function text(x: unknown): string {
  return typeof x === 'string' ? x : '';
}

function strings(x: unknown): string[] {
  return Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [];
}

/** The saved filters per tab: the new format (one object per tab) or the old one (`filters` was only for Plans). */
function readFilters(raw: unknown): FiltersByTab {
  const f = recordOf(raw);
  const fresh = ['now', 'plans', 'ideas'].some((k) => typeof f[k] === 'object' && f[k] !== null);
  const p = fresh ? recordOf(f.plans) : f;
  const a = recordOf(f.now);
  const i = recordOf(f.ideas);
  return {
    now: fresh ? { q: text(a.q), groups: strings(a.groups).filter(isGroup), plan: text(a.plan) } : { ...EMPTY_NOW_FILTERS, groups: [] },
    plans: { q: text(p.q), groups: strings(p.groups).filter(isGroup), track: text(p.track), tier: text(p.tier) },
    ideas: fresh ? { q: text(i.q), states: strings(i.states).filter(isIdeaState) } : { ...EMPTY_IDEAS_FILTERS, states: [] },
  };
}

/** A saved status the page can draw: a `status` message whose whole shape `isHostMessage` checks, plan by plan. */
function isDrawableStatus(x: unknown): x is StatusMessage {
  return isHostMessage(x) && x.type === 'status';
}

/**
 * A saved state of version 1 had two keys in Portuguese, `vista` (the grouping) and `ultimo` (the last status); so did
 * one from before the versions. They come over under the names of this version, and so do the open-block keys of
 * versions 1 and 2 (`renamedBlocks`).
 */
function renamedKeys(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.version === SAVED_VERSION) return raw;
  const { vista, ultimo, ...rest } = raw;
  const fields = raw.version === 2 ? raw : { ...rest, view: vista, last: ultimo };
  return { ...fields, openPhases: renamedBlocks(fields.openPhases), pages: renamedBlocks(fields.pages) };
}

/** The suffixes of the open-block and page keys up to version 2, and their names since version 3. */
const OLD_KEY_SUFFIXES: readonly (readonly [string, string])[] = [
  ['\u0000estado', '\u0000status'],
  ['\u0000agora', '\u0000now'],
  ['\u0000ideias', '\u0000ideas'],
];
/** The reserved block names up to version 2 inside a plan's open phases, and their names since version 3. */
const OLD_BLOCKS: Readonly<Record<string, string>> = { '@concluidas': '@done', '@abandonadas': '@abandoned' };

/**
 * Up to version 2 the keys and reserved blocks of `openPhases` and `pages` were in Portuguese: `<plan>\0estado`
 * (grouped by status), `<plan>\0agora` and `<plan>\0agora:<group>` (Now tab), `\0ideias` (Ideas tab), and the blocks
 * `@concluidas` and `@abandonadas`. They come over under the names of this version; the rest stays as it is.
 */
function renamedBlocks(x: unknown): unknown {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return x;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(x as Record<string, unknown>)) {
    let k = key;
    for (const [from, to] of OLD_KEY_SUFFIXES) {
      const at = k.indexOf(from);
      const rest = at < 0 ? undefined : k.slice(at + from.length);
      if (rest !== undefined && (rest === '' || rest.startsWith(':'))) k = k.slice(0, at) + to + rest;
    }
    out[k] = Array.isArray(value) ? value.map((v: unknown) => (typeof v === 'string' ? (OLD_BLOCKS[v] ?? v) : v)) : value;
  }
  return out;
}

/** The host data of a saved state of this version, each field only in the shape the page draws. */
function hostData(g: Record<string, unknown>): Pick<Saved, 'last' | 'plugin' | 'environment' | 'notices'> {
  return {
    ...(isDrawableStatus(g.last) ? { last: g.last } : {}),
    ...(isHostMessage({ type: 'plugin', plugin: g.plugin }) ? { plugin: g.plugin as PluginView } : {}),
    ...(isHostMessage({ type: 'environment', environment: g.environment }) ? { environment: g.environment as EnvironmentInput } : {}),
    ...(Array.isArray(g.notices) ? { notices: strings(g.notices) } : {}),
  };
}

/**
 * Reads what the host saved, from any version of the page. The UI choices (tab, open cards and phases, filters) are
 * read field by field: what is missing or came with another type takes the default, and what is extra is ignored.
 * The host data (last status, plugin, environment, notices) is kept only from a versioned saved state and in the shape
 * the page draws; otherwise it is dropped, and the host sends it again after `ready`. A saved state of version 1 or 2, or
 * from before the versions, comes over with its old keys renamed; one of a version this page does not know gives the
 * initial state.
 */
export function readSaved(x: unknown): Saved {
  const raw = recordOf(x);
  const known = raw.version === undefined || raw.version === 1 || raw.version === 2 || raw.version === SAVED_VERSION;
  const g = known ? renamedKeys(raw) : {};
  const openPhases: Record<string, string[]> = {};
  for (const [plan, dirs] of Object.entries(recordOf(g.openPhases))) openPhases[plan] = strings(dirs);
  const pages: Record<string, number> = {};
  for (const [list, n] of Object.entries(recordOf(g.pages))) if (typeof n === 'number' && Number.isInteger(n) && n > 0) pages[list] = n;
  return {
    version: SAVED_VERSION,
    expanded: strings(g.expanded),
    tab: isTab(g.tab) ? g.tab : 'plans',
    openPhases,
    filters: readFilters(g.filters),
    advanced: g.advanced === true,
    view: g.view === 'status' ? 'status' : 'phase',
    pages,
    ...(g.version !== undefined ? hostData(g) : {}),
  };
}

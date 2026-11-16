// Shapes that both the messages and the render use. No imports: `messages.ts` and the render modules depend on
// this file and never on each other.

/** The panel tabs, in row order. */
export const TABS = ['now', 'plans', 'ideas'] as const;

export type Tab = (typeof TABS)[number];

/** Where the agent plugin is installed. */
export type PluginScope = 'user' | 'project' | 'local';

/** What the host read about the agent plugin for the open folder. */
export type PluginState =
  | {
      state: 'active-project' | 'active-user' | 'inactive';
      scope: PluginScope;
      /** The registered version differs from the version in the marketplace folder. */
      newVersion?: { registered: string; folder: string };
      /**
       * In a folder marketplace: the source folder, which the CLI reads, and the copy in the cache, written only
       * on install, which other hosts (the Agents window) read.
       */
      copy?: { origin: string; cache: string };
    }
  | { state: 'not-installed' }
  | { state: 'error'; error: string };

/** The plugin state at the top: what the read decided, or a read or install in progress. */
export type PluginView = PluginState | { state: 'checking' } | { state: 'installing' };

/** The status of an environment check, as in `check.sh --json` (core/contract/schema/check.schema.json). */
export type CheckStatus = 'ok' | 'missing' | 'warning' | 'unknown';

/** An environment check, in the shape of `check.sh --json`; the ones from core/reader are accepted as they are. */
export interface CheckInput {
  id: string;
  status: CheckStatus;
  required: boolean;
  detail: string;
}

/** The `check.sh --json` object: what the host checked on the machine. */
export interface EnvironmentInput {
  ok: boolean;
  checks: CheckInput[];
}

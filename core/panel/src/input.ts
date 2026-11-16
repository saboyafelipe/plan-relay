// What the panel reads from a plan: only the keys of the `status --json` object (contract 1) that the view
// uses. The types are structural on purpose: the reader's validated status (core/reader), or any
// host's, is accepted as it is, so the panel does not depend on who read it.
import type { Key } from '@plan-relay/i18n';

/** The groups of contract 1. */
export type TaskGroup = 'in-progress' | 'available' | 'owner' | 'blocked' | 'draft' | 'done' | 'cancelled' | 'abandoned' | 'invalid';

/** The values of `Tier:` in contract 1, already normalized by the reader. */
export type TaskTier = 'junior' | 'mid' | 'senior';

export interface TaskInput {
  id: string;
  title: string;
  /** Relative to the plan folder; starts with the phase `dir`. */
  file: string;
  group: TaskGroup;
  type: string;
  track: string;
  tier: TaskTier;
  repos: string[];
  blocked_by: string[];
  /** How many tasks this one unblocks (the contract only gives the count; the view works out which). */
  unblocks: number;
  started: string | null;
  finished: string | null;
  next_step: string | null;
  waiting_on: string[];
  /** `Replaced by:`, `Given up by:` and `Given up with:`: only present when the header has the key. */
  replaced_by?: string;
  given_up_by?: string;
  given_up_with?: string;
}

export interface PhaseInput {
  /** The phase folder, relative to the plan folder (`phase-1-name`). */
  dir: string;
  title: string;
  done: number;
  total: number;
  in_progress: number;
  /** Only present, and true, on an abandoned phase. */
  abandoned?: true;
}

export interface StatusInput {
  progress: { done: number; total: number; pct: number };
  phases: PhaseInput[];
  tasks: TaskInput[];
  /** IDs of the tasks that can run at the same time right now. */
  parallel: string[];
  run: { open: boolean; log: string } | null;
}

/** The error codes that core/i18n translates: the `reader.<code>` keys. */
export type ErrorCodeInput = { [K in Key]: K extends `reader.${infer C}` ? C : never }[Key];

/** A reading error by code (the `ReaderError` of core/reader is accepted as it is). */
export interface ErrorInput {
  code: ErrorCodeInput;
  args: string[];
  cause?: ErrorInput;
}

interface BasePlan {
  /** The plan folder: identifies the card and the plan in messages. */
  folder: string;
  name: string;
}

/** What the view uses of a read idea (the `DiscoveredIdea` of core/reader is accepted as it is). */
export interface IdeaInput {
  /** The path of the idea file: identifies it in messages. */
  file: string;
  slug: string;
  title: string;
  status: 'open' | 'refining' | 'ready' | 'mapped' | 'invalid';
  /** `null`: unknown. */
  openQuestions: number | null;
  /** Only in `mapped`. */
  plan: string | null;
}

/** A plan that was read, with its status, or the reason it could not be read. */
export type PlanInput = (BasePlan & { status: StatusInput }) | (BasePlan & { error: ErrorInput });

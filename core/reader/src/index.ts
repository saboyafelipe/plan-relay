// core/reader: discovers the plans of a workspace and computes the status without running sh.
// It depends on no host: no editor API here.
// File access comes from outside (`Files`); `node.ts` brings the Node one for whoever runs on it.

export const PACKAGE_NAME = 'reader' as const;

export type { Files, Entry } from './files';
export { errorMessage, isRecord } from './util';
export * from './contract';
export { discover, type DiscoveredPlan } from './discover';
export { discoverIdeas, readIdea, IDEA_STATES, type IdeaState, type Idea, type DiscoveredIdea } from './ideas';
export { readStatus, readHeader, readStamp } from './status';
export {
  environmentOf,
  findOnPath,
  generalChecks,
  type Check,
  type CheckStatus,
  type Environment,
  type EnvironmentDeps,
} from './environment';
export {
  dependents,
  isAlive,
  giveUpClosure,
  reopenClosure,
  isValidReason,
  normalizeReason,
  canCancel,
  cancelRefusal,
  type RefusalKey,
  type GiveUpPreview,
  type GiveUpFall,
  type Refusal,
  type GraphTask,
} from './give-up';
export { appendToLog, cancel, giveUp, rewriteHeader, reopen, type LogKey, type Write, type EditResult, type TaskTexts } from './edit';

// Test helper: the fields a task or phase view must carry, with neutral values. The page validates the whole shape of
// a `status` message, so a fixture starts from these and sets only what its test is about.
import type { PhaseView, TaskView } from '../view';

export const TASK_VIEW: TaskView = {
  id: '',
  title: '',
  file: '',
  group: 'available',
  type: 'code',
  track: 'panel',
  tier: 'mid',
  repos: [],
  blockedBy: [],
  waitingOn: [],
  unblocks: [],
  pendingUnblocks: 0,
  started: null,
  finished: null,
  nextStep: null,
  phase: '',
  depth: 0,
  duration: null,
};

export const PHASE_VIEW: PhaseView = {
  title: '',
  done: 0,
  total: 0,
  pct: 0,
  dir: '',
  inProgress: 0,
  abandoned: false,
  counts: {},
  tasks: [],
};

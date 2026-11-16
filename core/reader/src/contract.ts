// Contract 1 of a plan: plan.json and the object of `status.sh --json`.
// The types mirror the JSON keys (English, public contract); the interface names are
// internal. Validation checks the required fields and the types and returns a new object with
// only the known fields; extra fields are ignored. No key of the old contract is read.
// The reader (status.ts) produces this object; validation serves whoever receives it from outside.

export const GROUPS = ['in-progress', 'available', 'owner', 'blocked', 'draft', 'done', 'cancelled', 'abandoned', 'invalid'] as const;
export type Group = (typeof GROUPS)[number];

/** The values of `Tier:` (contract.md, «Task header»); absent or any other value counts as `senior`. */
export const TIERS = ['junior', 'mid', 'senior'] as const;
export type Tier = (typeof TIERS)[number];

/** The normalized `Tier:`: `junior` or `mid` when written so, `senior` in any other case. */
export function tierOf(v: unknown): Tier {
  return v === 'junior' || v === 'mid' ? v : 'senior';
}

/** The plan file that discovery looks for in `agent_plans/<name>/`. */
export const PLAN_FILE = 'plan.json';

/**
 * The reader's error codes. The text lives in core/i18n, under the key `reader.<code>`,
 * with the `args` in place of `{0}`, `{1}`… and, when there is a `cause`, its text as the last argument.
 * `exception` carries a third party's message (fs, JSON.parse) as it is, untranslated.
 */
export const ERROR_CODES = [
  'folderMissing',
  'oldFormat',
  'unreadable',
  'notJson',
  'invalid',
  'notObject',
  'notText',
  'notTextNorNull',
  'notNumber',
  'notBoolean',
  'notList',
  'wrongContract',
  'unknownGroup',
  'missing',
  'notIntegerNorNull',
  'exception',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** A read error: ASCII code and arguments (data, never translatable text). */
export interface ReaderError {
  code: ErrorCode;
  args: string[];
  /** The error that caused this one (the validation behind `invalid`). */
  cause?: ReaderError;
}

export interface Failure {
  error: ReaderError;
}

export function readerError(code: ErrorCode, ...args: string[]): ReaderError {
  return { code: code, args };
}

export interface PlanJson {
  contract: 1;
  name: string;
  source: string | null;
  created: string;
}

export interface Progress {
  done: number;
  total: number;
  pct: number;
  in_progress: number;
  draft: number;
}

export interface PhaseStatus {
  dir: string;
  title: string;
  done: number;
  total: number;
  in_progress: number;
  /** Only present, and true, on the abandoned phase (contract.md, «phases»); absent reads as false. */
  abandoned?: true;
}

export interface TaskStatus {
  id: string;
  title: string;
  status: string;
  type: string;
  track: string;
  tier: Tier;
  repos: string[];
  blocked_by: string[];
  waiting_on: string[];
  group: Group;
  unblocks: number;
  started: string | null;
  finished: string | null;
  next_step: string | null;
  file: string;
  /** `Replaced by:`, `Given up by:` and `Given up with:`: only present when the header has the key with a value. */
  replaced_by?: string;
  given_up_by?: string;
  given_up_with?: string;
}

export interface Run {
  log: string;
  open: boolean;
  /**
   * Title of the last `## Handoff` of the log (only `YYYY-MM-DD HH:MM` when it starts that way), or null with none.
   * The reader and the validator always fill it in; optional in the type so that a hand-built object
   * (tests, hosts) stays valid, and absent reads as null.
   */
  handoff?: string | null;
}

export interface PlanStatus {
  contract: 1;
  name: string;
  language: string;
  profile: string;
  scripts_version: number | null;
  progress: Progress;
  phases: PhaseStatus[];
  tasks: TaskStatus[];
  parallel: string[];
  run: Run | null;
}

class Invalid extends Error {
  readonly error: ReaderError;
  constructor(code: ErrorCode, ...args: string[]) {
    super(code);
    this.error = readerError(code, ...args);
  }
}

type Obj = Record<string, unknown>;

function object(x: unknown, where: string): Obj {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) {
    throw new Invalid('notObject', where);
  }
  return x as Obj;
}

function text(o: Obj, field: string, where: string): string {
  const v = o[field];
  if (typeof v !== 'string') throw new Invalid('notText', `${where}.${field}`);
  return v;
}

function textOrNull(o: Obj, field: string, where: string): string | null {
  const v = o[field];
  if (v !== null && typeof v !== 'string') throw new Invalid('notTextNorNull', `${where}.${field}`);
  return v;
}

function number(o: Obj, field: string, where: string): number {
  const v = o[field];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Invalid('notNumber', `${where}.${field}`);
  return v;
}

function boolean(o: Obj, field: string, where: string): boolean {
  const v = o[field];
  if (typeof v !== 'boolean') throw new Invalid('notBoolean', `${where}.${field}`);
  return v;
}

function list(o: Obj, field: string, where: string): unknown[] {
  const v = o[field];
  if (!Array.isArray(v)) throw new Invalid('notList', `${where}.${field}`);
  return v;
}

function textList(o: Obj, field: string, where: string): string[] {
  return list(o, field, where).map((v, i) => {
    if (typeof v !== 'string') throw new Invalid('notText', `${where}.${field}[${i}]`);
    return v;
  });
}

function contractOne(o: Obj): 1 {
  if (o.contract !== 1) throw new Invalid('wrongContract', String(JSON.stringify(o.contract)));
  return 1;
}

function readTask(x: unknown, where: string): TaskStatus {
  const t = object(x, where);
  const group = text(t, 'group', where);
  if (!(GROUPS as readonly string[]).includes(group)) throw new Invalid('unknownGroup', `${where}.group`, group);
  return {
    id: text(t, 'id', where),
    title: text(t, 'title', where),
    status: text(t, 'status', where),
    type: text(t, 'type', where),
    track: text(t, 'track', where),
    // Absent in the output of scripts older than version 6; the contract says to read it as senior.
    tier: tierOf(t.tier),
    repos: textList(t, 'repos', where),
    blocked_by: textList(t, 'blocked_by', where),
    waiting_on: textList(t, 'waiting_on', where),
    group: group as Group,
    unblocks: number(t, 'unblocks', where),
    started: textOrNull(t, 'started', where),
    finished: textOrNull(t, 'finished', where),
    next_step: textOrNull(t, 'next_step', where),
    file: text(t, 'file', where),
    ...optionals(t, where, ['replaced_by', 'given_up_by', 'given_up_with'] as const),
  };
}

/** The optional text fields (since scripts_version 9): absent or null are left out. */
function optionals<K extends string>(o: Obj, where: string, fields: readonly K[]): Partial<Record<K, string>> {
  const r: Partial<Record<K, string>> = {};
  for (const c of fields) {
    if (o[c] === undefined || o[c] === null) continue;
    r[c] = text(o, c, where);
  }
  return r;
}

function readPhase(x: unknown, where: string): PhaseStatus {
  const f = object(x, where);
  return {
    dir: text(f, 'dir', where),
    title: text(f, 'title', where),
    done: number(f, 'done', where),
    total: number(f, 'total', where),
    in_progress: number(f, 'in_progress', where),
    // Since scripts_version 9; only the abandoned phase has the key.
    ...(f.abandoned === undefined ? {} : boolean(f, 'abandoned', where) ? { abandoned: true as const } : {}),
  };
}

function readRun(x: unknown): Run | null {
  if (x === null) return null;
  const r = object(x, 'run');
  // handoff exists since scripts_version 8; the output of an older status.sh, without the key, reads as null
  const handoff = r.handoff === undefined ? null : textOrNull(r, 'handoff', 'run');
  return { log: text(r, 'log', 'run'), open: boolean(r, 'open', 'run'), handoff };
}

function validate<T>(read: () => T): T | Failure {
  try {
    return read();
  } catch (e) {
    if (e instanceof Invalid) return { error: e.error };
    throw e;
  }
}

export function validateStatus(x: unknown): PlanStatus | Failure {
  return validate(() => {
    const o = object(x, 'status');
    const contract = contractOne(o);
    if (!('progress' in o)) throw new Invalid('missing', 'progress');
    const p = object(o.progress, 'progress');
    if (!('run' in o)) throw new Invalid('missing', 'run');
    const version = o.scripts_version;
    if (version !== null && !Number.isInteger(version)) throw new Invalid('notIntegerNorNull', 'status.scripts_version');
    return {
      contract,
      name: text(o, 'name', 'status'),
      language: text(o, 'language', 'status'),
      profile: text(o, 'profile', 'status'),
      scripts_version: version as number | null,
      progress: {
        done: number(p, 'done', 'progress'),
        total: number(p, 'total', 'progress'),
        pct: number(p, 'pct', 'progress'),
        in_progress: number(p, 'in_progress', 'progress'),
        draft: number(p, 'draft', 'progress'),
      },
      phases: list(o, 'phases', 'status').map((f, i) => readPhase(f, `phases[${i}]`)),
      tasks: list(o, 'tasks', 'status').map((t, i) => readTask(t, `tasks[${i}]`)),
      parallel: textList(o, 'parallel', 'status'),
      run: readRun(o.run),
    };
  });
}

export function validatePlanJson(x: unknown): PlanJson | Failure {
  return validate(() => {
    const o = object(x, PLAN_FILE);
    return {
      contract: contractOne(o),
      name: text(o, 'name', PLAN_FILE),
      source: textOrNull(o, 'source', PLAN_FILE),
      created: text(o, 'created', PLAN_FILE),
    };
  });
}

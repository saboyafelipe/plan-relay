// The status of a plan, computed from the headers in TypeScript: the same object as
// `status.sh --json` (core/contract/contract.md, «status.sh --json»), without running the script.
// The reference implementation is core/template/status.sh; the conformance suite
// (conformance.test.ts) checks the two against the same cases.
import type { Files } from './files';
import {
  readerError,
  tierOf,
  type Run,
  type PlanStatus,
  type Failure,
  type PhaseStatus,
  type Group,
  type Tier,
  type TaskStatus,
} from './contract';

const ID = /^F[0-9]+-[0-9]+(\.[0-9]+)*/;
const TITLE_WITHOUT_ID = /^F[0-9]+-[0-9]+(\.[0-9]+)*[ \t]*(—|-)[ \t]*/;
const NEXT_STEP = /^[ \t]*([-*][ \t]+)?Next step:[ \t]*/;
const AUTOPILOT_LOG = /^run-([0-9]{4}-[0-9]{2}-[0-9]{2})(?:-([0-9]+))?\.md$/;
const STAMP = /^# scripts_version: ([0-9]+)$/;

interface Header {
  status: string;
  type: string;
  track: string;
  tier: Tier;
  repos: string[];
  blocked_by: string[];
  started: string;
  finished: string;
  title: string;
  next_step: string | null;
  replaced_by: string;
  given_up_by: string;
  given_up_with: string;
}

/** A comma-separated list, without spaces or tabs, without empty items. */
function headerList(v: string): string[] {
  return v
    .replace(/[ \t]/g, '')
    .split(',')
    .filter((x) => x !== '');
}

/**
 * The header (`Key: value` lines up to the first `# `) and the last `Next step:` below the title.
 * The value runs to the end of the line; nothing after the title is header. Each line loses one CR at
 * its end first, so a task saved with CRLF reads like one saved with LF.
 */
export function readHeader(text: string): Header {
  const c: Header = {
    status: '',
    type: '',
    track: '',
    tier: 'senior',
    repos: [],
    blocked_by: [],
    started: '',
    finished: '',
    title: '',
    next_step: null,
    replaced_by: '',
    given_up_by: '',
    given_up_with: '',
  };
  let inHeader = true;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!inHeader) {
      if (NEXT_STEP.test(line)) c.next_step = line.replace(NEXT_STEP, '');
      continue;
    }
    const m = /^(Status|Type|Track|Tier|Repos|Started|Finished|Blocked by|Replaced by|Given up by|Given up with):[ \t]*/.exec(line);
    if (m) {
      const v = line.slice(m[0].length);
      switch (m[1]) {
        case 'Status':
          c.status = v;
          break;
        case 'Type':
          c.type = v;
          break;
        case 'Track':
          c.track = v;
          break;
        case 'Tier':
          c.tier = tierOf(v);
          break;
        case 'Repos':
          c.repos = headerList(v);
          break;
        case 'Started':
          c.started = v;
          break;
        case 'Finished':
          c.finished = v;
          break;
        case 'Blocked by':
          c.blocked_by = headerList(v);
          break;
        case 'Replaced by':
          c.replaced_by = v;
          break;
        case 'Given up by':
          c.given_up_by = v;
          break;
        case 'Given up with':
          c.given_up_with = v;
          break;
      }
      continue;
    }
    if (line.startsWith('# ')) {
      c.title = line.slice(2).replace(TITLE_WITHOUT_ID, '');
      inHeader = false;
    }
  }
  return c;
}

/** `cancelled` and `abandoned` stay out of the total. */
function excluded(status: string): boolean {
  return status === 'cancelled' || status === 'abandoned';
}

function padded9(x: string): string {
  return String(parseInt(x, 10) || 0).padStart(9, '0');
}

/** The contract order key («Order»): N of the phase, then each number of the ID; a name off the pattern goes after the IDs. */
function orderKey(phase: string, file: string): string {
  let k = padded9(phase.replace(/^phase-/, '').split('-')[0] ?? '');
  const m = ID.exec(file);
  if (m) for (const part of m[0].slice(1).split(/[-.]/)) k += '.' + padded9(part);
  else k += '~' + file;
  return `${k}\t${phase}/${file}`;
}

function byBytes(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The last segment of a path, with `/` or `\`. */
function folderName(folder: string): string {
  const parts = folder.split(/[\\/]/).filter((p) => p !== '');
  return parts[parts.length - 1] ?? folder;
}

/**
 * A text field of plan.json, as status.sh reads it: only a key of the top-level object counts (one nested in
 * another value, or quoted inside a string, does not); the last one wins; a value that is not a string, is
 * empty or has a backslash gives `fallback`. A scan, not `JSON.parse`, so that a broken file reads the same here
 * and in the shell.
 */
export function planField(planJson: string | undefined, field: string, fallback: string): string {
  if (planJson === undefined) return fallback;
  let depth = 0;
  let topIsObject = false;
  let state: 'key' | 'colon' | 'value' | 'comma' = 'key';
  let key = '';
  let found: string | undefined;
  for (let i = 0; i < planJson.length; i++) {
    const c = planJson[i];
    if (c === '"') {
      let j = i + 1;
      let escaped = false;
      while (j < planJson.length && planJson[j] !== '"') {
        if (planJson[j] === '\\') {
          escaped = true;
          j++;
        }
        j++;
      }
      const text = planJson.slice(i + 1, j);
      i = j;
      if (depth !== 1 || !topIsObject) continue;
      if (state === 'key') {
        key = text;
        state = 'colon';
      } else if (state === 'value') {
        if (key === field) found = escaped ? '' : text;
        state = 'comma';
      }
    } else if (c === '{' || c === '[') {
      if (depth === 1 && state === 'value') {
        if (key === field) found = '';
        state = 'comma';
      }
      depth++;
      if (depth === 1) {
        topIsObject = c === '{';
        state = 'key';
      }
    } else if (c === '}' || c === ']') {
      depth--;
    } else if (depth === 1 && topIsObject) {
      if (c === ':' && state === 'colon') state = 'value';
      else if (c === ',') state = 'key';
      else if (state === 'value' && !/[ \t\r\n]/.test(c ?? '')) {
        if (key === field) found = '';
        state = 'comma';
      }
    }
  }
  return found ? found : fallback;
}

/** The `# scripts_version: <N>` stamp of the status.sh copied into the plan, read as text. */
export function readStamp(statusSh: string | undefined): number | null {
  if (statusSh === undefined) return null;
  for (const line of statusSh.split('\n')) {
    const m = STAMP.exec(line);
    if (m) return Number(m[1]);
  }
  return null;
}

/** The latest autopilot log: highest date, then highest suffix (no suffix = 1). */
async function readRun(files: Files, folder: string): Promise<Run | null> {
  const notes = (await files.list(files.join(folder, 'notes'))) ?? [];
  let best: { key: string; name: string } | undefined;
  for (const e of notes) {
    const m = e.directory ? null : AUTOPILOT_LOG.exec(e.name);
    if (!m) continue;
    const key = `${m[1]} ${String(m[2] === undefined ? 1 : parseInt(m[2], 10)).padStart(9, '0')} ${e.name}`;
    if (!best || key > best.key) best = { key, name: e.name };
  }
  if (!best) return null;
  const text = (await files.read(files.join(folder, 'notes', best.name))) ?? '';
  return { log: `notes/${best.name}`, open: !/^## Closing/m.test(text), handoff: lastHandoff(text) };
}

/**
 * The title of the last `## Handoff` (followed by a space, punctuation or end of line), without the separator
 * (`—`, `–` or `-`) and without the spaces at the ends; starting with YYYY-MM-DD HH:MM, only the stamp. With none, null.
 */
export function lastHandoff(text: string): string | null {
  let rest: string | null = null;
  for (const m of text.matchAll(/^## Handoff(?![A-Za-z0-9_])(.*)$/gm)) rest = m[1] ?? '';
  if (rest === null) return null;
  const h = rest
    .replace(/^[ \t]+/, '')
    .replace(/^(—|–|-)/, '')
    .replace(/^[ \t]+/, '')
    .replace(/[ \t\r]+$/, '');
  const stamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?!\d)/.exec(h);
  return stamp ? stamp[0] : h;
}

async function phaseTitle(files: Files, folder: string, phase: string): Promise<string> {
  const text = await files.read(files.join(folder, phase, 'PHASE.md'));
  const line = text?.split('\n').find((l) => l.startsWith('# '));
  return line === undefined ? phase : line.slice(2).replace(/\r$/, '');
}

interface ReadTask extends Header {
  id: string;
  phase: string;
  file: string;
}

/**
 * The status of the plan in `folder`, like `status.sh --json [filter]`: the filter is an ID prefix or
 * a track name. Gives an error when the folder does not exist.
 */
export async function readStatus(files: Files, folder: string, filter?: string): Promise<PlanStatus | Failure> {
  const entries = await files.list(folder);
  if (entries === undefined) return { error: readerError('folderMissing', folder) };

  const [planJson, statusSh, run] = await Promise.all([
    files.read(files.join(folder, 'plan.json')),
    files.read(files.join(folder, 'status.sh')),
    readRun(files, folder),
  ]);

  // The task files (phase-*/F<digit>*.md), in contract order.
  const phasesOnDisk = entries.filter((e) => e.directory && e.name.startsWith('phase-')).map((e) => e.name);
  const perPhase = await Promise.all(
    phasesOnDisk.map(async (phase) =>
      ((await files.list(files.join(folder, phase))) ?? [])
        .filter((e) => !e.directory && /^F[0-9].*\.md$/.test(e.name))
        .map((e) => ({ phase, name: e.name, key: orderKey(phase, e.name) })),
    ),
  );
  const ordered = perPhase.flat().sort((a, b) => byBytes(a.key, b.key));
  const read: ReadTask[] = await Promise.all(
    ordered.map(async ({ phase, name }) => {
      const text = (await files.read(files.join(folder, phase, name))) ?? '';
      const m = ID.exec(name);
      return { ...readHeader(text), id: m ? m[0] : name, phase, file: `${phase}/${name}` };
    }),
  );

  // A duplicated id (more than one file): each file keeps its header and shows its status, but in every
  // count that reads the state it has none, so it is invalid, never done, and blocks who cites it.
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const t of read) (seen.has(t.id) ? duplicated : seen).add(t.id);
  const state = (t: ReadTask) => (duplicated.has(t.id) ? '' : t.status);

  const byId = new Map<string, ReadTask>();
  for (const t of read) if (!byId.has(t.id)) byId.set(t.id, t);
  const unblocks = new Map<string, number>();
  for (const t of read) {
    const e = state(t);
    if (e === 'done' || e === 'cancelled' || e === 'abandoned') continue;
    for (const b of t.blocked_by) unblocks.set(b, (unblocks.get(b) ?? 0) + 1);
  }
  const passes = (t: ReadTask) => !filter || t.id.startsWith(filter) || t.track === filter;
  const owner = (t: ReadTask) => t.type === 'decision' || t.type === 'human';

  const filtered = read.filter(passes);
  const tasks: TaskStatus[] = filtered.map((t) => {
    let group: Group;
    let waiting_on: string[] = [];
    const e = state(t);
    if (['in-progress', 'done', 'cancelled', 'abandoned', 'draft'].includes(e)) group = e as Group;
    else if (e !== 'ready') group = 'invalid';
    else {
      waiting_on = t.blocked_by.flatMap((b) => {
        const blocker = byId.get(b);
        if (!blocker) return [`${b}(?)`];
        return state(blocker) === 'done' ? [] : [b];
      });
      group = waiting_on.length > 0 ? 'blocked' : owner(t) ? 'owner' : 'available';
    }
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      type: t.type,
      track: t.track,
      tier: t.tier,
      repos: t.repos,
      blocked_by: t.blocked_by,
      waiting_on,
      group,
      unblocks: unblocks.get(t.id) ?? 0,
      started: t.started === '' ? null : t.started,
      finished: t.finished === '' ? null : t.finished,
      next_step: t.next_step,
      file: t.file,
      ...(t.replaced_by === '' ? {} : { replaced_by: t.replaced_by }),
      ...(t.given_up_by === '' ? {} : { given_up_by: t.given_up_by }),
      ...(t.given_up_with === '' ? {} : { given_up_with: t.given_up_with }),
    };
  });

  // Phases: in the order of first appearance in tasks; total without the cancelled and the abandoned.
  // The counts read the group, which follows the state (none for a duplicated id), not the status shown.
  const counts = new Map<string, PhaseStatus>();
  for (const t of tasks) {
    const phase = t.file.slice(0, t.file.indexOf('/'));
    let f = counts.get(phase);
    if (!f) counts.set(phase, (f = { dir: phase, title: phase, done: 0, total: 0, in_progress: 0 }));
    if (!excluded(t.group)) f.total++;
    if (t.group === 'done') f.done++;
    if (t.group === 'in-progress') f.in_progress++;
  }
  const phases = [...counts.values()];
  // The abandoned phase looks at the whole phase, not only at the tasks of the filter.
  for (const f of phases) {
    const ofPhase = read.filter((t) => t.phase === f.dir);
    if (ofPhase.every((t) => excluded(state(t))) && ofPhase.some((t) => state(t) === 'abandoned')) f.abandoned = true;
  }
  await Promise.all(phases.map(async (f) => (f.title = await phaseTitle(files, folder, f.dir))));

  // Parallel: the available ones by unblocks (stable sort), without a busy repository.
  const busy = new Set(tasks.filter((t) => t.group === 'in-progress').flatMap((t) => t.repos));
  const parallel: string[] = [];
  for (const t of tasks.filter((x) => x.group === 'available').sort((a, b) => b.unblocks - a.unblocks)) {
    if (t.repos.some((r) => busy.has(r))) continue;
    for (const r of t.repos) busy.add(r);
    parallel.push(t.id);
  }

  const done = tasks.filter((t) => t.group === 'done').length;
  const total = tasks.filter((t) => !excluded(t.group)).length;
  return {
    contract: 1,
    name: folderName(folder),
    language: planField(planJson, 'language', 'pt-BR'),
    profile: planField(planJson, 'profile', 'full'),
    scripts_version: readStamp(statusSh),
    progress: {
      done,
      total,
      pct: total > 0 ? Math.floor((100 * done) / total + 0.5) : 0,
      in_progress: tasks.filter((t) => t.group === 'in-progress').length,
      draft: tasks.filter((t) => t.group === 'draft').length,
    },
    phases,
    tasks,
    parallel,
    run,
  };
}

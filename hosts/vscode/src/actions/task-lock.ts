// The task lock of the contract ("Writers"), the same one task.sh takes, so the panel and a session running
// task.sh never write the same task at once. The lock of a task is the directory `.lock-<ID>` in the plan folder;
// creating it is the only way to take it. Right after, the owner writes `.lock-<ID>/owner`, one line
// `<host> <pid> <YYYY-MM-DDTHH:MM:SSZ>`; a lock without `owner` is being taken and counts as held.
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';

/** Refusal: the lock of `id` stayed held for the whole wait (`task.lockBusy`). */
export class LockBusy extends Error {
  constructor(readonly id: string) {
    super(`.lock-${id}`);
    this.name = 'LockBusy';
  }
}

/** Before a rename, the lock of the file `rel` no longer named this writer: nothing more was changed. */
export class LockLost extends Error {
  constructor(readonly rel: string) {
    super(rel);
    this.name = 'LockLost';
  }
}

/** The locks one writer holds. */
export interface HeldLocks {
  /** Whether the lock of `id` still names this writer (checked before each rename). */
  owns(id: string): Promise<boolean>;
  /** Removes `owner` and then the directory of each lock that still names this writer. */
  release(): Promise<void>;
}

export interface LockOptions {
  /** How long to wait for a held lock before `LockBusy`; task.sh's `TASK_LOCK_WAIT` default, 10 s. */
  waitMs?: number;
  /** `TASK_LOCK_STALE_MIN`: a lock older than this, by its owner's time, is an orphan. Default 1. */
  staleMin?: number;
  host?: string;
  pid?: number;
  now?: () => Date;
}

const TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;

/** The `owner` line: machine, process and the UTC time to the second. */
export function ownerLine(host: string, pid: number, when: Date): string {
  return `${host} ${pid} ${when.toISOString().replace(/\.\d+Z$/, 'Z')}`;
}

async function readOwner(dir: string): Promise<string | undefined> {
  try {
    const line = (await readFile(join(dir, 'owner'), 'utf8')).split('\n')[0];
    return line === '' ? undefined : line;
  } catch {
    return undefined;
  }
}

function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: the process exists, it belongs to someone else.
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function olderThan(dir: string, now: number, staleMs: number): Promise<boolean> {
  try {
    return now - (await stat(dir)).mtimeMs > staleMs;
  } catch {
    return false;
  }
}

/**
 * Orphan: the owner names this machine and a process that is not running, or the lock is older than `staleMin`
 * by the owner's time (by the directory's modification time when there is no owner, or it has no valid time).
 */
async function isOrphan(dir: string, owner: string | undefined, host: string, now: number, staleMs: number): Promise<boolean> {
  if (owner !== undefined) {
    const [h, p, t] = owner.split(' ');
    if (h === host && p !== undefined && /^\d+$/.test(p) && !running(Number(p))) return true;
    if (t !== undefined && TIME.test(t)) return now - Date.parse(t) > staleMs;
  }
  return olderThan(dir, now, staleMs);
}

/**
 * Steals an orphan: renames it away (a rename is atomic, so one waiter wins), checks the renamed one is the lock
 * that was judged, and removes it. A renamed lock that is not the judged one goes back when its name is free.
 */
async function steal(dir: string, judged: string | undefined, pid: number, now: number, staleMs: number): Promise<boolean> {
  const away = `${dir}.stale.${pid}`;
  await rm(away, { recursive: true, force: true });
  try {
    await rename(dir, away);
  } catch {
    return false;
  }
  const got = await readOwner(away);
  if (got !== judged || (got === undefined && !(await olderThan(away, now, staleMs)))) {
    const free = await stat(dir).then(
      () => false,
      () => true,
    );
    if (free) await rename(away, dir).catch(() => undefined);
    await rm(away, { recursive: true, force: true });
    return false;
  }
  await rm(away, { recursive: true, force: true });
  return true;
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/**
 * Takes the lock of each id, in the order given (the caller passes the plan order, one global order, so two
 * writers never wait on each other in a cycle). Waits up to `waitMs` for each; on `LockBusy` releases what it took.
 */
export async function takeLocks(folder: string, ids: readonly string[], o: LockOptions = {}): Promise<HeldLocks> {
  const host = o.host ?? hostname();
  const pid = o.pid ?? process.pid;
  const now = o.now ?? (() => new Date());
  const staleMs = (o.staleMin ?? 1) * 60_000;
  const waitMs = o.waitMs ?? 10_000;
  const me = ownerLine(host, pid, now());
  const dirOf = (id: string) => join(folder, `.lock-${id}`);
  const held: string[] = [];
  const owns = async (id: string) => (await readOwner(dirOf(id))) === me;
  const release = async () => {
    for (const id of [...held].reverse()) {
      if (!(await owns(id))) continue;
      await rm(join(dirOf(id), 'owner'), { force: true });
      await rmdir(dirOf(id)).catch(() => undefined);
    }
    held.length = 0;
  };

  async function takeOne(id: string): Promise<void> {
    const dir = dirOf(id);
    const deadline = Date.now() + waitMs;
    for (let turn = 0; ; turn++) {
      try {
        await mkdir(dir);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        // The orphan check on the first failure and then about once a second, as task.sh does.
        if (turn % 10 === 0) {
          const judged = await readOwner(dir);
          const t = now().getTime();
          if ((await isOrphan(dir, judged, host, t, staleMs)) && (await steal(dir, judged, pid, t, staleMs))) continue;
        }
        if (Date.now() >= deadline) throw new LockBusy(id);
        await sleep(100);
        continue;
      }
      held.push(id);
      const temp = join(dir, `owner.plan-relay-${randomBytes(4).toString('hex')}.tmp`);
      await writeFile(temp, `${me}\n`, 'utf8');
      await rename(temp, join(dir, 'owner'));
      if (!(await owns(id))) throw new LockBusy(id);
      return;
    }
  }

  try {
    for (const id of ids) await takeOne(id);
  } catch (e) {
    await release();
    throw e;
  }
  return { owns, release };
}

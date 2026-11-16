import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LockBusy, ownerLine, takeLocks } from './task-lock';

let folder: string;
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'task-lock-'));
});
afterEach(() => rmSync(folder, { recursive: true, force: true }));

const locks = () => readdirSync(folder).filter((n) => n.startsWith('.lock-'));
function plant(id: string, owner?: string): string {
  const dir = join(folder, `.lock-${id}`);
  mkdirSync(dir);
  if (owner !== undefined) writeFileSync(join(dir, 'owner'), `${owner}\n`);
  return dir;
}
/** A process id that is not running: a child that already exited. */
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid;

describe('takeLocks', () => {
  it('takes the locks in the given order, writes the owner and releases them', async () => {
    const held = await takeLocks(folder, ['F1-01', 'F1-02'], { pid: 4242, host: 'box', now: () => new Date('2026-01-02T03:04:05.678Z') });
    expect(locks().sort()).toEqual(['.lock-F1-01', '.lock-F1-02']);
    expect(readFileSync(join(folder, '.lock-F1-01', 'owner'), 'utf8')).toBe('box 4242 2026-01-02T03:04:05Z\n');
    expect(await held.owns('F1-02')).toBe(true);
    await held.release();
    expect(locks()).toEqual([]);
  });

  it('steals an orphan of a process of this machine that is not running', async () => {
    plant('F1-01', ownerLine(hostname(), deadPid(), new Date()));
    const held = await takeLocks(folder, ['F1-01'], { waitMs: 300 });
    expect(readFileSync(join(folder, '.lock-F1-01', 'owner'), 'utf8').startsWith(`${hostname()} ${process.pid} `)).toBe(true);
    expect(locks()).toEqual(['.lock-F1-01']);
    await held.release();
    expect(locks()).toEqual([]);
  });

  it('a running owner, or a recent one of another machine, is not stolen: LockBusy, and the lock stays', async () => {
    const live = ownerLine(hostname(), process.pid, new Date());
    plant('F1-01', live);
    await expect(takeLocks(folder, ['F1-01'], { waitMs: 200 })).rejects.toBeInstanceOf(LockBusy);
    expect(readFileSync(join(folder, '.lock-F1-01', 'owner'), 'utf8')).toBe(`${live}\n`);
    const elsewhere = ownerLine(`other-${hostname()}`, deadPid(), new Date());
    plant('F1-02', elsewhere);
    await expect(takeLocks(folder, ['F1-02'], { waitMs: 200 })).rejects.toBeInstanceOf(LockBusy);
  });

  it('a lock without owner is being taken: held while recent, an orphan when older than staleMin', async () => {
    const dir = plant('F1-01');
    await expect(takeLocks(folder, ['F1-01'], { waitMs: 200 })).rejects.toBeInstanceOf(LockBusy);
    const old = new Date('2020-01-01T00:00:00Z');
    utimesSync(dir, old, old);
    const held = await takeLocks(folder, ['F1-01'], { waitMs: 300 });
    await held.release();
    expect(locks()).toEqual([]);
  });

  it('an owner time older than staleMin is an orphan even with a running process', async () => {
    plant('F1-01', ownerLine(hostname(), process.pid, new Date('2020-01-01T00:00:00Z')));
    const held = await takeLocks(folder, ['F1-01'], { waitMs: 300 });
    expect(await held.owns('F1-01')).toBe(true);
    await held.release();
  });

  it('on LockBusy, releases the locks already taken; a lock that is no longer ours is not removed', async () => {
    plant('F1-02', ownerLine(hostname(), process.pid, new Date()));
    await expect(takeLocks(folder, ['F1-01', 'F1-02'], { waitMs: 200 })).rejects.toBeInstanceOf(LockBusy);
    expect(locks()).toEqual(['.lock-F1-02']);
    const held = await takeLocks(folder, ['F1-03']);
    writeFileSync(join(folder, '.lock-F1-03', 'owner'), 'someone 1 2026-01-01T00:00:00Z\n');
    expect(await held.owns('F1-03')).toBe(false);
    await held.release();
    expect(locks().sort()).toEqual(['.lock-F1-02', '.lock-F1-03']);
  });
});

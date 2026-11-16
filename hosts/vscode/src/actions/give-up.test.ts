import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { rename, unlink, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stringsFor } from '@plan-relay/i18n';
import type { ConfirmationData } from '@plan-relay/panel';
import { nodeFiles } from '@plan-relay/reader/node';
import { copyExample, temporaryFolder } from '@plan-relay/reader/testing';
import {
  giveUpTask,
  writeAll,
  readPlanToEdit,
  reopenTask,
  RewriteFailed,
  RewriteStuck,
  type Confirmation,
  type EditDeps,
  type WriteFs,
} from './give-up';
import { LockLost, ownerLine, takeLocks } from './task-lock';

const PT = stringsFor('pt-BR');

/** The content of each task file (`phase-*\/*.md`), by path relative to the plan folder. */
function tasksOf(folder: string): Record<string, string> {
  const r: Record<string, string> = {};
  for (const phase of readdirSync(folder).filter((d) => d.startsWith('phase-'))) {
    for (const fileArg of readdirSync(join(folder, phase)).filter((a) => a.endsWith('.md'))) {
      r[`${phase}/${fileArg}`] = readFileSync(join(folder, phase, fileArg), 'utf8');
    }
  }
  return r;
}

interface Simulation {
  confirm?: boolean;
  reason?: string | undefined;
  dirty?: string[];
  /** Runs between the confirmation and the write (another session touching the plan). */
  between?: () => void;
  /** `planRelay.notifications.taskAbandoned`; the setting defaults to on. */
  notifies?: boolean;
  /** Runs at the start of the write, with the locks held. */
  whileWriting?: () => void;
  /** The disk the write goes to; the default is the real one. */
  fs?: WriteFs;
}

function simulate(folder: string, s: Simulation = {}) {
  const steps: string[] = [];
  const confirmations: Confirmation[] = [];
  const data: ConfirmationData[] = [];
  const channel: string[] = [];
  const deps: EditDeps = {
    folder,
    read: () => readPlanToEdit(nodeFiles, folder),
    confirm: async (c) => {
      confirmations.push(c);
      steps.push('confirmar');
      return s.confirm ?? true;
    },
    confirmGiveUp: async (d) => {
      data.push(d);
      steps.push('confirmar');
      s.between?.();
      if (s.confirm === false) return undefined;
      return 'reason' in s ? s.reason : 'Sem máquina Windows disponível';
    },
    dirty: (files) => files.filter((a) => (s.dirty ?? []).includes(a)),
    lock: (ids) => takeLocks(folder, ids, { waitMs: 300 }),
    writeFiles: async (files, before, stillOwned) => {
      steps.push(`gravar ${[...files.keys()].join(' ')}`);
      s.whileWriting?.();
      await writeAll(folder, files, s.fs, before, stillOwned);
    },
    requestLoad: () => steps.push('carga'),
    alert: (t) => steps.push(`avisar ${t}`),
    inform: (t) => steps.push(`informar ${t}`),
    notifiesGiveUp: () => s.notifies ?? true,
    channel: { info: (t) => channel.push(`info ${t}`), warn: (t) => channel.push(`warn ${t}`) },
    strings: PT,
  };
  return { deps, steps, confirmations, data, channel };
}

let tmp: { folder: string; remove: () => void };
let plan: string;

beforeEach(() => {
  tmp = temporaryFolder();
  plan = copyExample(tmp.folder);
});
afterEach(() => tmp.remove());

describe('giveUpTask', () => {
  it('refuses an in-progress root, without confirming or writing', async () => {
    const before = tasksOf(plan);
    const s = simulate(plan);
    expect(await giveUpTask('F0-03', s.deps)).toBe('refused');
    expect(s.steps).toEqual([`avisar ${PT.t('notice.brand', PT.t('task.giveupOnlyReadyOrDraft', 'F0-03', 'in-progress'))}`]);
    expect(tasksOf(plan)).toEqual(before);
  });

  it('the confirmation receives the giveup --json preview and the phase titles', async () => {
    const s = simulate(plan, { confirm: false });
    expect(await giveUpTask('F1-02', s.deps)).toBe('cancelled');
    expect(s.steps).toEqual(['confirmar']);
    const d = s.data[0];
    if (d === undefined) throw new Error('the confirmation received no data');
    expect(d.preview.falls.map((q) => [q.id, q.depth, q.also_depends_on])).toEqual([
      ['F1-02', 0, []],
      ['F1-03', 1, ['F1-01', 'F0-03']],
      ['F1-04', 2, []],
    ]);
    expect(d.phases['phase-1-busca']).toMatch(/Busca/);
  });

  it('an invalid reason ("aaa bbb 111 ---") that reaches the host does not write', async () => {
    const before = tasksOf(plan);
    const s = simulate(plan, { reason: 'aaa bbb 111 ---' });
    expect(await giveUpTask('F1-02', s.deps)).toBe('refused');
    expect(s.steps.at(-1)).toBe(`avisar ${PT.t('notice.brand', PT.t('task.invalidReason'))}`);
    expect(tasksOf(plan)).toEqual(before);
  });

  it('"Go back" (or the tab closed) does not write', async () => {
    const before = tasksOf(plan);
    const s = simulate(plan, { reason: undefined });
    expect(await giveUpTask('F1-02', s.deps)).toBe('cancelled');
    expect(tasksOf(plan)).toEqual(before);
  });

  it('applied: writes exactly the closure files, byte for byte like task.sh giveup --yes', async () => {
    const other = copyExample(join(tmp.folder, 'b'));
    execFileSync('sh', [join(other, 'task.sh'), 'giveup', 'F1-02', '--reason', 'Sem máquina Windows disponível', '--yes'], {
      cwd: other,
    });
    const before = tasksOf(plan);
    const s = simulate(plan);
    expect(await giveUpTask('F1-02', s.deps)).toBe('applied');
    const after = tasksOf(plan);
    expect(after).toEqual(tasksOf(other));
    const changedOnes = Object.keys(after).filter((k) => after[k] !== before[k]);
    expect(changedOnes.sort()).toEqual(
      ['phase-1-busca/F1-02-motor-de-busca.md', 'phase-1-busca/F1-03-pagina-de-busca.md', 'phase-1-busca/F1-04-sinonimos.md'].sort(),
    );
    expect(s.steps).toContain('carga');
  });

  it('with the taskAbandoned notification on, the host gives no success notice: a cascade is a single notice', async () => {
    const s = simulate(plan, { notifies: true });
    expect(await giveUpTask('F1-02', s.deps)).toBe('applied');
    expect(s.steps.filter((p) => p.startsWith('informar'))).toEqual([]);
  });

  it('with the notification off, the host notifies with the right plural', async () => {
    const s = simulate(plan, { notifies: false });
    expect(await giveUpTask('F1-02', s.deps)).toBe('applied');
    expect(s.steps.filter((p) => p.startsWith('informar'))).toEqual([
      `informar ${PT.t('notice.brand', PT.t('giveup.doneWithMore', 'F1-02', 2))}`,
    ]);
    expect(PT.t('giveup.doneWithMore', 'F1-02', 2)).toBe('F1-02 abandonada, com mais 2 tasks');
  });

  it('with the notification off, a single task says only "abandonada", and one with one more says "mais 1 task"', async () => {
    const only = simulate(plan, { notifies: false });
    expect(await giveUpTask('F1-04', only.deps)).toBe('applied');
    expect(only.steps.filter((p) => p.startsWith('informar'))).toEqual([
      `informar ${PT.t('notice.brand', PT.t('giveup.doneOnly', 'F1-04'))}`,
    ]);
    expect(PT.t('giveup.doneOnly', 'F1-04')).toBe('F1-04 abandonada');
    // In another copy: here F1-04 has already fallen, and F1-03 would fall alone.
    const oneOf = simulate(copyExample(join(tmp.folder, 'b')), { notifies: false });
    expect(await giveUpTask('F1-03', oneOf.deps)).toBe('applied');
    expect(oneOf.steps.filter((p) => p.startsWith('informar'))).toEqual([
      `informar ${PT.t('notice.brand', PT.t('giveup.doneWithOneMore', 'F1-03'))}`,
    ]);
    expect(PT.t('giveup.doneWithOneMore', 'F1-03')).toBe('F1-03 abandonada, com mais 1 task');
  });

  it('the plan changed between the confirmation and the write (a claim in another session): refuses and does not write', async () => {
    const s = simulate(plan, {
      between: () => {
        const f = join(plan, 'phase-1-busca', 'F1-03-pagina-de-busca.md');
        writeFileSync(f, readFileSync(f, 'utf8').replace(/^Status: ready/, 'Status: in-progress'));
      },
    });
    expect(await giveUpTask('F1-02', s.deps)).toBe('changed');
    expect(s.steps.some((p) => p.startsWith('gravar'))).toBe(false);
    expect(s.steps.at(-1)).toContain(PT.t('task.giveupStuck', 'F1-02', 'F1-03 (in-progress)'));
    // Only the other session's claim changed the disk.
    expect(Object.values(tasksOf(plan)).filter((t) => t.includes('abandoned'))).toEqual([]);
  });

  it('a closure file with unsaved changes in the editor: refuses before confirming', async () => {
    const s = simulate(plan, { dirty: ['phase-1-busca/F1-03-pagina-de-busca.md'] });
    expect(await giveUpTask('F1-02', s.deps)).toBe('refused');
    expect(s.steps).toEqual([`avisar ${PT.t('notice.brand', PT.t('edit.notSaved', 'F1-03'))}`]);
  });

  it('a task that does not exist: the text carries the plan folder', async () => {
    const s = simulate(plan);
    expect(await giveUpTask('F9-99', s.deps)).toBe('refused');
    expect(s.steps).toEqual([`avisar ${PT.t('notice.brand', PT.t('task.notFound', 'F9-99', plan))}`]);
  });
});

describe('reopenTask', () => {
  it('returns the text: after giving up and reopening, each task goes back to ready or draft like task.sh reopen', async () => {
    const other = copyExample(join(tmp.folder, 'b'));
    execFileSync('sh', [join(other, 'task.sh'), 'giveup', 'F1-02', '--reason', 'Sem máquina Windows disponível', '--yes'], { cwd: other });
    execFileSync('sh', [join(other, 'task.sh'), 'reopen', 'F1-02'], { cwd: other });
    expect(await giveUpTask('F1-02', simulate(plan).deps)).toBe('applied');
    const s = simulate(plan);
    expect(await reopenTask('F1-02', s.deps)).toBe('reopened');
    expect(s.confirmations[0]?.text).toBe(PT.t('reopen.title', 'F1-02', 2));
    expect(s.confirmations[0]?.button).toBe(PT.t('reopen.button', 3));
    // "Reopen" has no notification: it always notifies, with the right plural.
    expect(s.steps.filter((p) => p.startsWith('informar'))).toEqual([`informar ${PT.t('notice.brand', PT.t('reopen.done', 'F1-02', 2))}`]);
    expect(PT.t('reopen.done', 'F1-02', 2)).toBe('F1-02 retomada, com mais 2 tasks');
    expect(tasksOf(plan)).toEqual(tasksOf(other));
    const f14 = readFileSync(join(plan, 'phase-1-busca', 'F1-04-sinonimos.md'), 'utf8');
    expect(f14.startsWith('Status: draft\n')).toBe(true);
  });

  it('the "Reopen" notice says only "retomada" for a single task and "mais 1 task" with one more', async () => {
    expect(await giveUpTask('F1-04', simulate(plan).deps)).toBe('applied');
    const only = simulate(plan);
    expect(await reopenTask('F1-04', only.deps)).toBe('reopened');
    expect(only.steps.at(-1)).toBe(`informar ${PT.t('notice.brand', PT.t('reopen.doneOnly', 'F1-04'))}`);
    expect(PT.t('reopen.doneOnly', 'F1-04')).toBe('F1-04 retomada');
    expect(await giveUpTask('F1-03', simulate(plan).deps)).toBe('applied');
    const oneOf = simulate(plan);
    expect(await reopenTask('F1-03', oneOf.deps)).toBe('reopened');
    expect(oneOf.steps.at(-1)).toBe(`informar ${PT.t('notice.brand', PT.t('reopen.doneOne', 'F1-03'))}`);
    expect(PT.t('reopen.doneOne', 'F1-03')).toBe('F1-03 retomada, com mais 1 task');
  });

  it('refuses to reopen a child, naming the root', async () => {
    await giveUpTask('F1-02', simulate(plan).deps);
    const s = simulate(plan);
    expect(await reopenTask('F1-03', s.deps)).toBe('refused');
    expect(s.steps).toEqual([`avisar ${PT.t('notice.brand', PT.t('task.reopenAtRoot', 'F1-03', 'F1-02'))}`]);
  });
});

describe('the task lock', () => {
  const closure = ['F1-02', 'F1-03', 'F1-04'];
  const locksIn = (folder: string) => readdirSync(folder).filter((n) => n.startsWith('.lock-'));

  it('writes holding the lock of every task it changes, with this process as owner, and releases them', async () => {
    const seen: string[] = [];
    const s = simulate(plan, {
      whileWriting: () => {
        for (const n of locksIn(plan).sort())
          seen.push(`${n} ${readFileSync(join(plan, n, 'owner'), 'utf8').replace(/\S+Z\n$/, '<time>')}`);
      },
    });
    expect(await giveUpTask('F1-02', s.deps)).toBe('applied');
    expect(seen).toEqual(closure.map((id) => `.lock-${id} ${hostname()} ${process.pid} <time>`));
    expect(locksIn(plan)).toEqual([]);
  });

  it('another writer holding the lock of a task in the closure: waits, refuses with task.lockBusy and writes nothing', async () => {
    const other = ownerLine(hostname(), process.pid, new Date());
    mkdirSync(join(plan, '.lock-F1-03'));
    writeFileSync(join(plan, '.lock-F1-03', 'owner'), `${other}\n`);
    const before = tasksOf(plan);
    const s = simulate(plan);
    expect(await giveUpTask('F1-02', s.deps)).toBe('refused');
    expect(tasksOf(plan)).toEqual(before);
    expect(s.steps).toContain(`avisar ${PT.t('notice.brand', PT.t('task.lockBusy', 'F1-03', plan, '.lock-F1-03'))}`);
    expect(readFileSync(join(plan, '.lock-F1-03', 'owner'), 'utf8')).toBe(`${other}\n`);
    expect(locksIn(plan)).toEqual(['.lock-F1-03']);
  });

  it('reopen takes the locks too', async () => {
    expect(await giveUpTask('F1-02', simulate(plan).deps)).toBe('applied');
    const seen: string[] = [];
    const s = simulate(plan, { whileWriting: () => seen.push(...locksIn(plan).sort()) });
    expect(await reopenTask('F1-02', s.deps)).toBe('reopened');
    expect(seen).toEqual(closure.map((id) => `.lock-${id}`));
    expect(existsSync(join(plan, '.lock-F1-02'))).toBe(false);
  });
});

describe('a write that fails midway, in the panel', () => {
  /** The real disk, except that the rename onto `target` fails, and, if `restoreFails`, so does every rename after it. */
  function failing(target: string, restoreFails: boolean): WriteFs {
    let failed = false;
    return {
      write: (c, t) => writeFile(c, t, 'utf8'),
      remove: (c) => unlink(c),
      renameFile: async (de, to) => {
        if (failed && restoreFails) throw new Error('permission denied');
        if (to.endsWith(target)) {
          failed = true;
          throw new Error('disco cheio');
        }
        await rename(de, to);
      },
    };
  }
  const second = 'phase-1-busca/F1-03-pagina-de-busca.md';

  it('the files are put back, the failure goes to the output channel and the notice says what failed', async () => {
    const before = tasksOf(plan);
    const s = simulate(plan, { fs: failing(second, false) });
    expect(await giveUpTask('F1-02', s.deps)).toBe('error');
    expect(tasksOf(plan)).toEqual(before);
    expect(s.channel).toContain('warn disco cheio');
    expect(s.steps).toContain(`avisar ${PT.t('notice.brand', PT.t('edit.failed', PT.t('task.rewriteFailed', 'F1-03')))}`);
    expect(readdirSync(join(plan, 'phase-1-busca')).filter((a) => a.includes('.tmp'))).toEqual([]);
  });

  it('a restore that fails too: the channel gets the reason and the notice names the state of each file', async () => {
    const s = simulate(plan, { fs: failing(second, true) });
    expect(await giveUpTask('F1-02', s.deps)).toBe('error');
    expect(s.channel).toContain(`warn ${PT.t('log.restoreFailed', 'F1-02', 'permission denied')}`);
    const text = [
      PT.t('task.rewriteStuck', 'F1-03'),
      PT.t('task.stateReplaced', 'F1-02'),
      PT.t('task.stateUntouched', 'F1-03'),
      PT.t('task.stateUntouched', 'F1-04'),
    ].join('\n');
    expect(s.steps).toContain(`avisar ${PT.t('notice.brand', PT.t('edit.failed', text))}`);
    expect(readdirSync(join(plan, 'phase-1-busca')).filter((a) => a.includes('.tmp'))).toEqual([]);
  });
});

describe('writeAll', () => {
  function fakeFs(failOnRename?: string) {
    const disk = new Map<string, string>([
      ['/p/a.md', 'A'],
      ['/p/b.md', 'B'],
    ]);
    const fs: WriteFs = {
      write: async (c, t) => void disk.set(c, t),
      renameFile: async (de, to) => {
        if (to === failOnRename) throw new Error('disco cheio');
        disk.set(to, disk.get(de) as string);
        disk.delete(de);
      },
      remove: async (c) => void disk.delete(c),
    };
    return { fs, disk };
  }

  it('writes all', async () => {
    const { fs, disk } = fakeFs();
    await writeAll(
      '/p',
      new Map([
        ['a.md', 'A2'],
        ['b.md', 'B2'],
      ]),
      fs,
    );
    expect([...disk.entries()].sort()).toEqual([
      ['/p/a.md', 'A2'],
      ['/p/b.md', 'B2'],
    ]);
  });

  it('a failure midway restores those that had already changed and leaves no temporaries', async () => {
    const { fs, disk } = fakeFs('/p/b.md');
    const before = new Map([
      ['a.md', 'A'],
      ['b.md', 'B'],
    ]);
    await expect(
      writeAll(
        '/p',
        new Map([
          ['a.md', 'A2'],
          ['b.md', 'B2'],
        ]),
        fs,
        before,
      ),
    ).rejects.toThrow('disco cheio');
    expect([...disk.entries()].sort()).toEqual([
      ['/p/a.md', 'A'],
      ['/p/b.md', 'B'],
    ]);
  });

  it('a restore goes through a temporary and a rename, not a direct write', async () => {
    const { fs, disk } = fakeFs('/p/b.md');
    const renames: string[] = [];
    const rename = fs.renameFile.bind(fs);
    fs.renameFile = async (de, to) => {
      renames.push(to);
      await rename(de, to);
    };
    const direct: string[] = [];
    const write = fs.write.bind(fs);
    fs.write = async (c, t) => {
      direct.push(c);
      await write(c, t);
    };
    await expect(
      writeAll(
        '/p',
        new Map([
          ['a.md', 'A2'],
          ['b.md', 'B2'],
        ]),
        fs,
        new Map([
          ['a.md', 'A'],
          ['b.md', 'B'],
        ]),
      ),
    ).rejects.toBeInstanceOf(RewriteFailed);
    // a.md replaced, b.md failed (never lands), a.md put back by a rename
    expect(renames).toEqual(['/p/a.md', '/p/b.md', '/p/a.md']);
    expect(direct.every((c) => c.endsWith('.tmp'))).toBe(true);
    expect([...disk.keys()].sort()).toEqual(['/p/a.md', '/p/b.md']);
  });

  it('a restore that fails too: RewriteStuck names the state of each file and leaves no temporaries', async () => {
    const { fs, disk } = fakeFs('/p/c.md');
    disk.set('/p/c.md', 'C');
    const renameOk = fs.renameFile.bind(fs);
    let renames = 0;
    fs.renameFile = async (de, to) => {
      renames += 1;
      // renames 1 and 2 replace a.md and b.md; 3 fails (c.md); 4 restores a.md and fails; 5 restores b.md
      if (renames === 4) throw new Error('permission denied');
      await renameOk(de, to);
    };
    const err = await writeAll(
      '/p',
      new Map([
        ['a.md', 'A2'],
        ['b.md', 'B2'],
        ['c.md', 'C2'],
      ]),
      fs,
      new Map([
        ['a.md', 'A'],
        ['b.md', 'B'],
        ['c.md', 'C'],
      ]),
    ).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RewriteStuck);
    const stuck = err as RewriteStuck;
    expect(stuck.rel).toBe('c.md');
    expect([...stuck.states]).toEqual([
      ['a.md', 'replaced'],
      ['b.md', 'restored'],
      ['c.md', 'untouched'],
    ]);
    expect([...stuck.errors]).toEqual([['a.md', 'permission denied']]);
    expect([...disk.entries()].sort()).toEqual([
      ['/p/a.md', 'A2'],
      ['/p/b.md', 'B'],
      ['/p/c.md', 'C'],
    ]);
  });

  it('each file goes to a temporary next to it and is swapped in by a rename', async () => {
    const { fs, disk } = fakeFs();
    const renames: string[] = [];
    const rename = fs.renameFile.bind(fs);
    fs.renameFile = async (de, to) => {
      renames.push(`${de} -> ${to}`);
      await rename(de, to);
    };
    await writeAll('/p', new Map([['a.md', 'A2']]), fs);
    expect(renames).toHaveLength(1);
    expect(renames[0]).toMatch(/^\/p\/a\.md\.plan-relay-[0-9a-f]{8}\.tmp -> \/p\/a\.md$/);
    expect(disk.get('/p/a.md')).toBe('A2');
  });

  it('a lock no longer ours before a rename: stops, changes nothing more and leaves no temporaries', async () => {
    const { fs, disk } = fakeFs();
    await expect(
      writeAll(
        '/p',
        new Map([
          ['a.md', 'A2'],
          ['b.md', 'B2'],
        ]),
        fs,
        new Map([
          ['a.md', 'A'],
          ['b.md', 'B'],
        ]),
        async (rel) => rel !== 'b.md',
      ),
    ).rejects.toBeInstanceOf(LockLost);
    expect([...disk.entries()].sort()).toEqual([
      ['/p/a.md', 'A2'],
      ['/p/b.md', 'B'],
    ]);
  });
});

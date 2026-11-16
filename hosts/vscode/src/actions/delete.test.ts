import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deletePlan, type DeleteFs } from './delete';

const ROOT = '/ws/projeto';
const FOLDER = join(ROOT, 'agent_plans', 'conta');
/** Where the entry skill used to live: "Delete" no longer touches it. */
const OLD_SKILL = join(ROOT, '.claude', 'skills', 'conta');

function simulatedFs(existingOnes: string[], failOn?: string): DeleteFs & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    exists: async (c) => existingOnes.includes(c),
    realpath: async (c) => c,
    remove: async (c) => {
      if (c === failOn) throw new Error('sem lixo');
      deleted.push(c);
    },
  };
}

describe('deletePlan', () => {
  it('deletes only the plan folder, even if a skill folder with the same name exists', async () => {
    const fs = simulatedFs([FOLDER, OLD_SKILL]);
    const r = await deletePlan(ROOT, FOLDER, fs);
    expect(r).toEqual({ ok: true, deleted: [FOLDER] });
    expect(fs.deleted).toEqual([FOLDER]);
  });

  it('refuses anything that is not a direct child folder of <root>/agent_plans/', async () => {
    const refused = [
      ROOT,
      join(ROOT, 'agent_plans'),
      join(ROOT, 'agent_plans', 'conta', 'phase-0'),
      join(ROOT, 'agent_plans', '..', 'src'),
      join(ROOT, 'outra', 'conta'),
      '/ws/outro/agent_plans/conta',
      'agent_plans/conta',
      `${FOLDER}\0`,
    ];
    for (const folder of refused) {
      const fs = simulatedFs([folder, FOLDER]);
      const r = await deletePlan(ROOT, folder, fs);
      expect(r.ok, folder).toBe(false);
      expect(fs.deleted, folder).toEqual([]);
    }
  });

  it('the plan folder no longer exists → error, nothing deleted', async () => {
    const fs = simulatedFs([]);
    const r = await deletePlan(ROOT, FOLDER, fs);
    expect(r.ok).toBe(false);
    expect(fs.deleted).toEqual([]);
  });

  it('failure deleting the folder → error, nothing deleted', async () => {
    const fs = simulatedFs([FOLDER], FOLDER);
    const r = await deletePlan(ROOT, FOLDER, fs);
    expect(r).toEqual({ ok: false, error: expect.stringContaining('sem lixo') as unknown, deleted: [] });
    expect(fs.deleted).toEqual([]);
  });
});

describe('deletePlan on the real file system (links resolved)', () => {
  let root: string;
  let outside: string;

  beforeEach(() => {
    const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'delete-')));
    root = join(tmp, 'project');
    outside = join(tmp, 'elsewhere');
    mkdirSync(join(root, 'agent_plans', 'kept'), { recursive: true });
    mkdirSync(join(outside, 'other-plan'), { recursive: true });
  });

  afterEach(() => rmSync(join(root, '..'), { recursive: true, force: true }));

  function realFs(): DeleteFs & { deleted: string[] } {
    const deleted: string[] = [];
    return { deleted, exists: async () => true, realpath: (p) => realpath(p), remove: async (p) => void deleted.push(p) };
  }

  it('refuses a plan folder that is a symbolic link leading outside agent_plans/', async () => {
    const link = join(root, 'agent_plans', 'escape');
    symlinkSync(join(outside, 'other-plan'), link);
    const fs = realFs();
    const r = await deletePlan(root, link, fs);
    expect(r.ok).toBe(false);
    expect(fs.deleted).toEqual([]);
  });

  it('deletes a real plan folder', async () => {
    const fs = realFs();
    const folder = join(root, 'agent_plans', 'kept');
    expect(await deletePlan(root, folder, fs)).toEqual({ ok: true, deleted: [folder] });
  });
});

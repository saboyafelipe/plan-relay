import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveInside, resolveReal } from './open';

const PLAN = '/ws/agent_plans/test-plan';

describe('resolveInside', () => {
  it('accepts a file inside the plan folder', () => {
    expect(resolveInside(PLAN, 'phase-0/F0-01.md')).toBe(join(PLAN, 'phase-0', 'F0-01.md'));
    expect(resolveInside(PLAN, 'MAP.md')).toBe(join(PLAN, 'MAP.md'));
    expect(resolveInside(PLAN, 'PLAN.md')).toBe(join(PLAN, 'PLAN.md'));
  });

  it('refuses what leaves the plan folder', () => {
    for (const file of ['../x.md', '/etc/passwd', 'phase-0/../../x', '', '.', 'phase-0/..', 'a\0b.md']) {
      expect(resolveInside(PLAN, file), file).toBeUndefined();
    }
  });
});

describe('resolveReal', () => {
  let root: string;
  let plan: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'open-')));
    plan = join(root, 'agent_plans', 'p');
    mkdirSync(join(plan, 'phase-0'), { recursive: true });
    writeFileSync(join(plan, 'MAP.md'), '# map\n');
    writeFileSync(join(plan, 'phase-0', 'F0-01.md'), 'Status: ready\n');
    writeFileSync(join(root, 'secret.txt'), 'outside\n');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('accepts a file inside the plan folder, and a link that stays inside (as written)', async () => {
    symlinkSync(join(plan, 'MAP.md'), join(plan, 'map-link.md'));
    expect(await resolveReal(plan, 'phase-0/F0-01.md')).toBe(join(plan, 'phase-0', 'F0-01.md'));
    expect(await resolveReal(plan, 'map-link.md')).toBe(join(plan, 'map-link.md'));
  });

  it('refuses a link inside the plan that points outside it, to a file or through a folder', async () => {
    symlinkSync(join(root, 'secret.txt'), join(plan, 'escape.md'));
    symlinkSync(root, join(plan, 'phase-9'));
    expect(await resolveReal(plan, 'escape.md')).toBeUndefined();
    expect(await resolveReal(plan, 'phase-9/secret.txt')).toBeUndefined();
  });

  it('refuses what the lexical check refuses', async () => {
    expect(await resolveReal(plan, '../../secret.txt')).toBeUndefined();
  });

  it('accepts a plan folder reached through a link (the comparison is between real paths)', async () => {
    symlinkSync(plan, join(root, 'plan-link'));
    expect(await resolveReal(join(root, 'plan-link'), 'MAP.md')).toBe(join(root, 'plan-link', 'MAP.md'));
  });

  it('rejects when the file does not exist, so the caller reports it could not open', async () => {
    await expect(resolveReal(plan, 'missing.md')).rejects.toThrow();
  });
});

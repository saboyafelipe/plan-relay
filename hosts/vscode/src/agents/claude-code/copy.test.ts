import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { temporaryFolder } from '@plan-relay/reader/testing';
import { sameFolders } from './copy';

describe('sameFolders (the cache copy against the source folder)', () => {
  let tmp: { folder: string; remove: () => void };
  let origin: string;
  let cache: string;

  beforeEach(() => {
    tmp = temporaryFolder();
    origin = join(tmp.folder, 'origem com espaço');
    cache = join(tmp.folder, 'cache');
    mkdirSync(join(origin, 'skills', 'plan'), { recursive: true });
    mkdirSync(join(origin, '.claude-plugin'));
    writeFileSync(join(origin, 'skills', 'plan', 'SKILL.md'), 'skill\n');
    writeFileSync(join(origin, '.claude-plugin', 'plugin.json'), '{}\n');
    cpSync(origin, cache, { recursive: true });
  });
  afterEach(() => tmp.remove());

  it('equal → true', async () => {
    expect(await sameFolders(origin, cache)).toBe(true);
  });

  it('a file with different bytes → false', async () => {
    writeFileSync(join(origin, 'skills', 'plan', 'SKILL.md'), 'skill nova\n');
    expect(await sameFolders(origin, cache)).toBe(false);
  });

  it('an extra file on either side → false', async () => {
    writeFileSync(join(cache, 'a-mais.md'), 'x');
    expect(await sameFolders(origin, cache)).toBe(false);
    rmSync(join(cache, 'a-mais.md'));
    writeFileSync(join(origin, 'novo.md'), 'x');
    expect(await sameFolders(origin, cache)).toBe(false);
  });

  it('cache deleted → false; unreadable source → undefined', async () => {
    rmSync(cache, { recursive: true });
    expect(await sameFolders(origin, cache)).toBe(false);
    expect(await sameFolders(join(tmp.folder, 'nao-existe'), origin)).toBeUndefined();
  });
});

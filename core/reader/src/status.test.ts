// Reader rules outside the conformance cases: the template fixture, the example project,
// the stamp and the injected file access. describe, it, expect, beforeEach and afterEach come
// from the vitest globals.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Files } from './files';
import { readStatus, readHeader, readStamp, lastHandoff, planField } from './status';
import { nodeFiles } from './node';
import { copyExample, createPlan, temporaryFolder, TEMPLATE_STATUS } from './testing/fixture';

let tmp: ReturnType<typeof temporaryFolder>;
let plan: string;

beforeEach(() => {
  tmp = temporaryFolder();
  plan = createPlan(tmp.folder);
});
afterEach(() => tmp.remove());

async function read(folder: string, filter?: string) {
  const r = await readStatus(nodeFiles, folder, filter);
  if ('error' in r) throw new Error(JSON.stringify(r.error));
  return r;
}

describe('readStatus', () => {
  it('reads the progress of the fixture: 1 done, 9 in total, 1 in progress, 1 draft', async () => {
    const r = await read(plan);
    const p = r.progress;
    expect([p.done, p.total, p.in_progress, p.draft]).toEqual([1, 9, 1, 1]);
    expect(r.name).toBe('test-plan');
    expect(r.tasks).toHaveLength(10);
    expect([r.language, r.profile]).toEqual(['pt-BR', 'full']);
  });

  it('sees the open autopilot log', async () => {
    expect((await read(plan)).run).toEqual({ log: 'notes/run-2026-11-13.md', open: true, handoff: null });
  });

  it('handoff: the last ## Handoff, only the stamp; a hand-written title whole; with none, null', () => {
    expect(lastHandoff('# Run\n## Tasks\n')).toBeNull();
    expect(
      lastHandoff(
        '## Handoff — 2026-11-14 10:05 UTC\nx\n## Handoff — 2026-11-14 18:47 UTC\n## Handoffs\n ## Handoff — 2026-11-14 23:59 UTC\n',
      ),
    ).toBe('2026-11-14 18:47');
    expect(lastHandoff('## Handoff - antes do almoço  \r\n')).toBe('antes do almoço');
    expect(lastHandoff('## Handoff\n')).toBe('');
    expect(lastHandoff('## Handoff — 2026-11-14 18:470\n')).toBe('2026-11-14 18:470');
  });

  it('carries intact the title with quotes and backslash and the next step with a tab', async () => {
    const r = await read(plan);
    expect(r.tasks.find((t) => t.id === 'F1-01')?.title).toBe('Título com "aspas" e barra \\ invertida');
    expect(r.tasks.find((t) => t.id === 'F0-02')?.next_step).toBe('retomar o \\"passo 3\\"\tdepois do teste');
  });

  it('reads scripts_version from the stamp of the status.sh copied into the plan, without running it', async () => {
    const stamp = readStamp(readFileSync(TEMPLATE_STATUS, 'utf8'));
    expect(stamp).toBeGreaterThanOrEqual(1);
    expect((await read(plan)).scripts_version).toBe(stamp);
    writeFileSync(join(plan, 'status.sh'), '#!/bin/sh\n# scripts_version: 7\nexit 1\n');
    expect((await read(plan)).scripts_version).toBe(7);
    writeFileSync(join(plan, 'status.sh'), '#!/bin/sh\nexit 1\n');
    expect((await read(plan)).scripts_version).toBeNull();
  });

  it('reads language and profile from plan.json', async () => {
    writeFileSync(
      join(plan, 'plan.json'),
      JSON.stringify({ contract: 1, name: 'test-plan', source: null, created: 'x', language: 'en', profile: 'lean' }, null, 2),
    );
    expect(await read(plan)).toMatchObject({ language: 'en', profile: 'lean' });
  });

  it('reads the plan of the example project (copy)', async () => {
    const r = await read(copyExample(join(tmp.folder, 'demo')));
    expect(r.name).toBe('site-de-receitas');
    expect([r.progress.done, r.progress.total, r.progress.in_progress]).toEqual([2, 7, 1]);
    expect(r.tasks.find((t) => t.group === 'in-progress')?.id).toBe('F0-03');
    expect(r.tasks.find((t) => t.group === 'owner')?.id).toBe('F1-02');
  });

  it('a folder that does not exist gives an error', async () => {
    expect(await readStatus(nodeFiles, join(tmp.folder, 'nao-existe'))).toEqual({
      error: { code: 'folderMissing', args: [join(tmp.folder, 'nao-existe')] },
    });
  });

  it('uses only the file access it receives (in-memory plan, separator \\)', async () => {
    const disk: Record<string, string> = {
      'C:\\ws\\p\\plan.json': '{"contract": 1, "name": "p", "source": null, "created": "x", "language": "en"}',
      'C:\\ws\\p\\phase-1-a\\F1-01-x.md': 'Status: ready\nType: human\n\n# F1-01 - Pedir acesso\n',
    };
    const folders: Record<string, { name: string; directory: boolean }[]> = {
      'C:\\ws\\p': [
        { name: 'plan.json', directory: false },
        { name: 'phase-1-a', directory: true },
      ],
      'C:\\ws\\p\\phase-1-a': [{ name: 'F1-01-x.md', directory: false }],
    };
    const inMemory: Files = {
      list: async (p) => folders[p],
      read: async (a) => disk[a],
      join: (...parts) => parts.join('\\'),
    };
    const r = await readStatus(inMemory, 'C:\\ws\\p');
    if ('error' in r) throw new Error(JSON.stringify(r.error));
    expect(r).toMatchObject({ name: 'p', language: 'en', scripts_version: null, run: null, parallel: [] });
    expect(r.tasks).toEqual([
      expect.objectContaining({ id: 'F1-01', title: 'Pedir acesso', group: 'owner', file: 'phase-1-a/F1-01-x.md' }),
    ]);
    expect(r.phases).toEqual([{ dir: 'phase-1-a', title: 'phase-1-a', done: 0, total: 1, in_progress: 0 }]);
  });
});

describe('planField (the top-level key only, as plan-field.awk reads it)', () => {
  it('reads the top-level key; nested or quoted ones do not count; the last one wins', () => {
    expect(planField('{"language": "en", "x": {"language": "pt-BR"}}', 'language', 'pt-BR')).toBe('en');
    expect(planField('{"x": [{"language": "en"}], "note": "\\"language\\": \\"en\\""}', 'language', 'pt-BR')).toBe('pt-BR');
    expect(planField('{"language": "pt-BR",\n "language": "EN-us"}', 'language', 'pt-BR')).toBe('EN-us');
  });

  it('a value that is not a plain string, or a file without the key, gives the fallback', () => {
    for (const text of [
      '{"language": 1}',
      '{"language": ""}',
      '{"language": "a\\\\b"}',
      '{"language": ["en"]}',
      '["language", "en"]',
      '{}',
    ]) {
      expect(planField(text, 'language', 'pt-BR'), text).toBe('pt-BR');
    }
    expect(planField(undefined, 'language', 'pt-BR')).toBe('pt-BR');
  });
});

describe('readHeader', () => {
  it('stops at the title: a key after the title is not header', () => {
    const c = readHeader('Status: ready\nTrack: a\n\n# F1-01 — T\n\nStatus: done\nTrack: b\n');
    expect([c.status, c.track, c.title]).toEqual(['ready', 'a', 'T']);
  });

  it('Repos and Blocked by without spaces and without empty items', () => {
    const c = readHeader('Status: ready\nRepos: a, b ,,c\nBlocked by:\tF1-01 ,F0-02,\n\n# F1-03 - x\n');
    expect([c.repos, c.blocked_by]).toEqual([
      ['a', 'b', 'c'],
      ['F1-01', 'F0-02'],
    ]);
  });

  it('the last Next step: that starts the line counts, after spaces and - or *', () => {
    const c = readHeader('Status: in-progress\n\n# F1-01 - x\n- Next step: um\n  * Next step: dois\nver o Next step: três\n');
    expect(c.next_step).toBe('dois');
  });
});

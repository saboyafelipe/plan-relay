import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { planView } from '@plan-relay/panel';
import { load, type LoadedPlan } from './plans/load';
import { createPlan, temporaryFolder } from '@plan-relay/reader/testing';

// The host's whole path: reading (core/reader) the fixture plan reaches the core/panel view.
// The view rules are tested in core/panel/src/view.test.ts.
const NOW = new Date(Date.UTC(2026, 10, 13, 12, 5));
let tmp: ReturnType<typeof temporaryFolder>;
let plan: LoadedPlan;

beforeAll(async () => {
  tmp = temporaryFolder();
  createPlan(tmp.folder);
  const [loaded] = await load([tmp.folder]);
  if (loaded === undefined) throw new Error('the fixture plan was not loaded');
  plan = loaded;
});
afterAll(() => tmp.remove());

describe('reading → view', () => {
  it('the fixture plan gives the expected card and tasks', () => {
    const v = planView(plan, NOW);
    expect(v).toMatchObject({ id: plan.folder, name: 'test-plan', badge: 'run-open', pct: 11, done: 1, total: 9 });
    expect(v.phases.flatMap((f) => f.tasks).find((t) => t.group === 'in-progress')).toMatchObject({ id: 'F0-02', duration: 125 });
  });

  it('in a plan with phase-2 and phase-10, the bars come out in numeric order', async () => {
    const ws = temporaryFolder();
    const folder = createPlan(ws.folder, 'plano-ordem');
    const phases: [string, string, string][] = [
      ['phase-10-dez', 'F10-01-a.md', 'Fase 10'],
      ['phase-2-dois', 'F2-01-a.md', 'Fase 2'],
    ];
    for (const [dir, file, title] of phases) {
      mkdirSync(join(folder, dir));
      writeFileSync(join(folder, dir, 'PHASE.md'), `# ${title}\n`);
      writeFileSync(join(folder, dir, file), `Status: ready\nType: code\nTrack: ordem\n\n# ${file.slice(0, -5)} - t\n`);
    }
    try {
      const [loaded] = await load([ws.folder]);
      if (loaded === undefined) throw new Error('the ordering plan was not loaded');
      expect(planView(loaded, NOW).phases.map((f) => f.title)).toEqual(['Fase 0 — Base', 'Fase 1 — Resto', 'Fase 2', 'Fase 10']);
    } finally {
      ws.remove();
    }
  });
});

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// describe, it, expect, beforeEach and afterEach come from the vitest globals.
import { createPlan, temporaryFolder } from './testing/fixture';
import { discover } from './discover';
import { nodeFiles } from './node';

const discoverPlans = (folders: string[]) => discover(nodeFiles, folders);

let tmp: ReturnType<typeof temporaryFolder>;
let ws1: string;
let ws2: string;

beforeEach(() => {
  tmp = temporaryFolder();
  ws1 = join(tmp.folder, 'ws1');
  ws2 = join(tmp.folder, 'ws2');
  mkdirSync(ws2, { recursive: true });
  createPlan(ws1, 'zeta');
  createPlan(ws1, 'alfa');
});
afterEach(() => tmp.remove());

describe('discover', () => {
  it('finds the plans of each workspace folder, in the order of the folders and then by name', async () => {
    createPlan(ws2, 'beta');
    const r = await discoverPlans([ws2, ws1]);
    expect(r.map((p) => [p.workspaceFolder, p.name])).toEqual([
      [ws2, 'beta'],
      [ws1, 'alfa'],
      [ws1, 'zeta'],
    ]);
    expect(r[1]?.folder).toBe(join(ws1, 'agent_plans', 'alfa'));
    expect(r[1]).toMatchObject({ plan: { contract: 1, name: 'alfa' } });
    expect(r.every((p) => !('error' in p))).toBe(true);
  });

  it('a folder without agent_plans/ gives nothing', async () => {
    expect(await discoverPlans([ws2])).toEqual([]);
  });

  it('a directory without plan.json is not a plan', async () => {
    mkdirSync(join(ws1, 'agent_plans', 'solto', 'notes'), { recursive: true });
    writeFileSync(join(ws1, 'agent_plans', 'LEIA.md'), 'arquivo solto');
    const r = await discoverPlans([ws1]);
    expect(r.map((p) => p.name)).toEqual(['alfa', 'zeta']);
  });

  it('folders that start with _ or . are not plans, even with plan.json', async () => {
    createPlan(ws1, '_ideas');
    createPlan(ws1, '.oculto');
    const r = await discoverPlans([ws1]);
    expect(r.map((p) => p.name)).toEqual(['alfa', 'zeta']);
  });

  it('a broken plan.json gives an entry with an error', async () => {
    createPlan(ws2, 'partido', '{ "contract": 1, ');
    const r = await discoverPlans([ws2]);
    expect(r).toHaveLength(1);
    // The JSON.parse message is third-party: it goes as an argument, untranslated.
    expect(r[0]).toMatchObject({ name: 'partido', error: { code: 'notJson', args: ['plan.json', expect.any(String)] } });
  });

  // The plan's name is the folder's, as in status.sh: a renamed folder keeps showing its plan.
  it('a name different from the folder still gives the plan, under the folder name', async () => {
    createPlan(ws2, 'renamed', { contract: 1, name: 'original', source: null, created: '2026-11-13T15:00Z' });
    const r = await discoverPlans([ws2]);
    expect(r).toHaveLength(1);
    expect(r[0]).not.toHaveProperty('error');
    expect(r[0]).toMatchObject({ name: 'renamed', plan: { name: 'original' } });
  });

  it('a contract other than 1 gives an error', async () => {
    createPlan(ws2, 'new', { contract: 2, name: 'new', source: null, created: '2026-11-13T15:00Z' });
    const r = await discoverPlans([ws2]);
    expect(r[0]).toMatchObject({
      name: 'new',
      error: { code: 'invalid', args: ['plan.json'], cause: { code: 'wrongContract', args: ['2'] } },
    });
  });

  it('a plan in the old format (only the old plan file) appears with an error that says how to convert it', async () => {
    const folder = createPlan(ws2, 'antigo');
    rmSync(join(folder, 'plan.json'));
    writeFileSync(join(folder, 'plano.json'), JSON.stringify({ contrato: 1, name: 'antigo', origin: null, criado: 'x' }));
    const r = await discoverPlans([ws2]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ name: 'antigo', error: { code: 'oldFormat', args: ['plano.json', 'plan.json'] } });
    expect(r[0]).not.toHaveProperty('plan');
  });

  it('with both files, plan.json wins', async () => {
    const folder = createPlan(ws2, 'ambos');
    writeFileSync(join(folder, 'plano.json'), '{}');
    const r = await discoverPlans([ws2]);
    expect(r[0]).toMatchObject({ name: 'ambos', plan: { name: 'ambos' } });
  });
});

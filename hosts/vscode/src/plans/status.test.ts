import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPlan, temporaryFolder } from '@plan-relay/reader/testing';
import { discoverPlans, readPlanStatus } from './status';

let tmp: ReturnType<typeof temporaryFolder>;
let plan: string;

beforeEach(() => {
  tmp = temporaryFolder();
  plan = createPlan(tmp.folder);
});
afterEach(() => tmp.remove());

describe('readPlanStatus (glue between core/reader and the disk)', () => {
  it('reads the plan state from disk', async () => {
    const r = await readPlanStatus(plan);
    if ('error' in r) throw new Error(JSON.stringify(r.error));
    expect(r).toMatchObject({ name: 'test-plan', progress: { done: 1, total: 9 } });
  });

  it('does not run the plan status.sh: a script that would leave a trace leaves nothing', async () => {
    const trace = join(tmp.folder, 'rodou');
    writeFileSync(join(plan, 'status.sh'), `#!/bin/sh\n# scripts_version: 9\ntouch "${trace}"\nexit 1\n`);
    const r = await readPlanStatus(plan);
    if ('error' in r) throw new Error(JSON.stringify(r.error));
    expect(r.scripts_version).toBe(9);
    const { existsSync } = await import('node:fs');
    expect(existsSync(trace)).toBe(false);
  });

  it('without the plan folder it errors', async () => {
    expect(await readPlanStatus(join(tmp.folder, 'nao-existe'))).toHaveProperty('error');
  });

  it('discoverPlans finds the plan in the workspace folder', async () => {
    expect((await discoverPlans([tmp.folder])).map((p) => p.name)).toEqual(['test-plan']);
  });
});

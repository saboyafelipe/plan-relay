import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyExample, createPlan, temporaryFolder } from '@plan-relay/reader/testing';
import { load } from './load';

let tmp: ReturnType<typeof temporaryFolder>;

beforeEach(() => {
  tmp = temporaryFolder();
});
afterEach(() => tmp.remove());

describe('load', () => {
  it('a plan with an error does not take down the others', async () => {
    const ws = join(tmp.folder, 'ws');
    createPlan(ws, 'a');
    createPlan(ws, 'b', '{ "contract": 1, ');
    createPlan(ws, 'c');
    const r = await load([ws]);
    expect(r.map((p) => p.name)).toEqual(['a', 'b', 'c']);
    expect(r[0]).toMatchObject({ status: { name: 'a', progress: { done: 1, total: 9 } } });
    expect(r[1]).toMatchObject({ name: 'b', error: { code: 'notJson', args: ['plan.json', expect.any(String)] } });
    expect(r[1]).not.toHaveProperty('status');
    expect(r[2]).toMatchObject({ status: { name: 'c' } });
  });

  it('an invalid plan.json shows up with the discovery error, without reading the state', async () => {
    const ws = join(tmp.folder, 'ws');
    createPlan(ws, 'a', '[]');
    const r = await load([ws]);
    expect(r).toEqual([
      expect.objectContaining({
        name: 'a',
        error: { code: 'invalid', args: ['plan.json'], cause: { code: 'notObject', args: ['plan.json'] } },
      }),
    ]);
  });

  it('the example project (copy) loads without error', async () => {
    const ws = join(tmp.folder, 'demo');
    copyExample(ws);
    const r = await load([ws]);
    expect(r).toHaveLength(1);
    expect(r[0]).not.toHaveProperty('error');
    expect(r[0]).toMatchObject({ name: 'site-de-receitas', status: { name: 'site-de-receitas', progress: { done: 2, total: 7 } } });
  });
});

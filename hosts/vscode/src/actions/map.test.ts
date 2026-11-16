import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stringsFor } from '@plan-relay/i18n';
import { mapTarget, planNotice, type PlanWithOrigin } from './map';

const PT = stringsFor('pt-BR');

const WS = '/ws/projeto';
const WS2 = '/ws/outro';

function plan(workspaceFolder: string, name: string, origin: string | null): PlanWithOrigin {
  return { workspaceFolder, name, folder: join(workspaceFolder, 'agent_plans', name), origin };
}

describe('mapTarget', () => {
  it('no plan with that source → relative path and no existing plan', () => {
    const r = mapTarget(join(WS, 'PLANO-X.md'), [WS], [plan(WS, 'outro', 'PLANO-Y.md')]);
    expect(r).toEqual({ workspaceFolder: WS, relativePath: 'PLANO-X.md', existing: undefined });
  });

  it('plan.json with an equal source → that plan', () => {
    const p = plan(WS, 'conta', 'docs/PLANO-X.md');
    const r = mapTarget(join(WS, 'docs', 'PLANO-X.md'), [WS], [plan(WS, 'outro', 'PLANO-X.md'), p]);
    expect(r?.relativePath).toBe('docs/PLANO-X.md');
    expect(r?.existing).toBe(p);
  });

  it('a source with a leading "./" also matches', () => {
    const p = plan(WS, 'conta', './PLANO-X.md');
    expect(mapTarget(join(WS, 'PLANO-X.md'), [WS], [p])?.existing).toBe(p);
  });

  it('a null source never matches', () => {
    const r = mapTarget(join(WS, 'null'), [WS], [plan(WS, 'conversa', null)]);
    expect(r?.existing).toBeUndefined();
  });

  it('multi-root: relative to the right folder, and only the plans of that folder count', () => {
    const inOther = plan(WS2, 'conta', 'PLANO-X.md');
    const r = mapTarget(join(WS2, 'PLANO-X.md'), [WS, WS2], [plan(WS, 'conta', 'PLANO-X.md'), inOther]);
    expect(r).toEqual({ workspaceFolder: WS2, relativePath: 'PLANO-X.md', existing: inOther });
  });

  it('nested folders: the deepest wins', () => {
    const background = join(WS, 'sub');
    const r = mapTarget(join(background, 'P.md'), [WS, background], []);
    expect(r).toEqual({ workspaceFolder: background, relativePath: 'P.md', existing: undefined });
  });

  it('capitalization as on disk: not normalized', () => {
    const r = mapTarget(join(WS, 'Docs', 'Plano.md'), [WS], [plan(WS, 'conta', 'docs/plano.md')]);
    expect(r?.relativePath).toBe('Docs/Plano.md');
    expect(r?.existing).toBeUndefined();
  });

  it('outside any workspace folder → undefined', () => {
    expect(mapTarget('/noutro/sitio/P.md', [WS], [])).toBeUndefined();
    expect(mapTarget('/ws/projeto-irmao/P.md', [WS], [])).toBeUndefined();
  });
});

describe('planNotice', () => {
  it('no work running → simple notice', () => {
    const a = planNotice('conta', 'map', { running: 0, runOpen: false }, PT);
    expect(a.strong).toBe(false);
    expect(a.text).toContain('«conta»');
    expect(a.detail).toContain('lixo');
    expect(a.detail).not.toMatch(/andamento|corrida/);
  });

  it('delete trashes only the plan folder: there is no entry skill', () => {
    for (const status of [{ running: 0, runOpen: false }, { running: 1, runOpen: true }, undefined]) {
      const a = planNotice('conta', 'delete', status, PT);
      expect(a.detail).toContain('agent_plans/conta/');
      expect(a.detail).not.toMatch(/skill/);
    }
  });

  it('tasks in progress → strong notice with the count', () => {
    const one = planNotice('conta', 'map', { running: 1, runOpen: false }, PT);
    expect(one.strong).toBe(true);
    expect(one.detail).toContain('1 task em andamento');
    expect(one.detail).not.toContain('corrida');
    const three = planNotice('conta', 'delete', { running: 3, runOpen: false }, PT);
    expect(three.detail).toContain('3 tasks em andamento');
  });

  it('autopilot open → strong notice saying a run is open', () => {
    const a = planNotice('conta', 'delete', { running: 0, runOpen: true }, PT);
    expect(a.strong).toBe(true);
    expect(a.detail).toContain('corrida do piloto aberta');
  });

  it('both → strong notice with both', () => {
    const a = planNotice('conta', 'map', { running: 2, runOpen: true }, PT);
    expect(a.strong).toBe(true);
    expect(a.detail).toContain('2 tasks em andamento');
    expect(a.detail).toContain('corrida do piloto aberta');
  });

  it('state not read → strong notice that confirms nothing', () => {
    const a = planNotice('conta', 'delete', undefined, PT);
    expect(a.strong).toBe(true);
    expect(a.detail).toContain('Não foi possível ler o estado');
  });

  it('the title changes with the action', () => {
    expect(planNotice('conta', 'map', { running: 0, runOpen: false }, PT).text).toContain('já deu o plano');
    expect(planNotice('conta', 'delete', { running: 0, runOpen: false }, PT).text).toContain('Apagar o plano');
  });
});

import { describe, expect, it } from 'vitest';
import type { PlanStatus } from '../plans/contract';
import type { LoadedPlan } from '../plans/load';
import { refreshLines } from './log-lines';
import { stringsFor } from '@plan-relay/i18n';

const PT = stringsFor('pt-BR');

function status(in_progress: number, done: number): PlanStatus {
  return {
    contract: 1,
    name: 'p',
    language: 'pt-BR',
    profile: 'full',
    scripts_version: 4,
    progress: { done, total: 9, pct: 0, in_progress, draft: 0 },
    phases: [],
    tasks: [],
    parallel: [],
    run: null,
  };
}

const base = { workspaceFolder: '/ws', folder: '/ws/agent_plans/x' };

describe('refreshLines', () => {
  it('one line per plan with the reason, in-progress and done counts; error as a warning', () => {
    const plans: LoadedPlan[] = [
      { ...base, name: 'test-plan', status: status(2, 1) },
      { ...base, name: 'partido', error: { code: 'notJson', args: ['plan.json', 'Unexpected end of JSON input'] } },
    ];
    expect(refreshLines('file', plans, PT)).toEqual([
      { tier: 'info', text: 'atualizado (arquivo): test-plan in_progress=2 done=1' },
      { tier: 'warn', text: 'atualizado (arquivo): partido erro — plan.json não é JSON: Unexpected end of JSON input' },
    ]);
  });

  it('with no plans says there are none', () => {
    expect(refreshLines('interval', [], PT)).toEqual([{ tier: 'info', text: 'atualizado (intervalo): nenhum plano' }]);
  });
});

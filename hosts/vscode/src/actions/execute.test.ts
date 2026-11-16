import { describe, expect, it } from 'vitest';
import type { LoadedPlan } from '../plans/load';
import type { PlanStatus, Group, TaskStatus } from '../plans/contract';
import { claudeCodePrompt } from '../agents/claude-code/prompts';
import { openWithPrompt } from '../agents/provider';
import { actionTarget, run, copyCommand, execute, type ActionDeps } from './execute';
import type { ModalOption } from './modal';
import type { PlanNotice } from './map';
import { stringsFor } from '@plan-relay/i18n';

const PT = stringsFor('pt-BR');

function task(id: string, group: Group): TaskStatus {
  return {
    id,
    title: id,
    status: 'ready',
    type: 'code',
    track: 't',
    tier: 'senior',
    repos: [],
    blocked_by: [],
    waiting_on: [],
    group: group,
    unblocks: 0,
    started: null,
    finished: null,
    next_step: null,
    file: `phase-1/${id}.md`,
  };
}

function status(run: PlanStatus['run'] = null): PlanStatus {
  return {
    contract: 1,
    name: 'bh',
    language: 'pt-BR',
    profile: 'full',
    scripts_version: 4,
    progress: { done: 0, total: 5, pct: 0, in_progress: 1, draft: 0 },
    phases: [],
    parallel: [],
    run,
    tasks: [
      task('F1-01', 'available'),
      task('F1-02', 'owner'),
      task('F1-03', 'in-progress'),
      task('F1-04', 'blocked'),
      task('F1-05', 'done'),
    ],
  };
}

const BH: LoadedPlan = { workspaceFolder: '/ws', name: 'bh', folder: '/ws/agent_plans/bh', status: status() };
const FAILED_PLAN: LoadedPlan = {
  workspaceFolder: '/ws',
  name: 'mau',
  folder: '/ws/agent_plans/mau',
  error: { code: 'exception', args: ['EACCES'] },
};

describe('actionTarget', () => {
  it('run accepts available, owner and in-progress from the last read', () => {
    for (const [id, group] of [
      ['F1-01', 'available'],
      ['F1-02', 'owner'],
      ['F1-03', 'in-progress'],
    ] as const) {
      const r = actionTarget([BH], BH.folder, id);
      expect(r).toMatchObject({ plan: { name: 'bh' }, task: { id, group: group } });
    }
  });

  it('run refuses waiting, done, an unknown ID, an unread plan and a plan with an error', () => {
    expect(actionTarget([BH], BH.folder, 'F1-04', PT)).toEqual({ error: 'executar: F1-04 de bh não tem botão (blocked)' });
    expect(actionTarget([BH], BH.folder, 'F1-05', PT)).toEqual({ error: 'executar: F1-05 de bh não tem botão (done)' });
    expect(actionTarget([BH], BH.folder, 'F9-99', PT)).toEqual({ error: 'executar: task desconhecida F9-99 em bh' });
    expect(actionTarget([BH], '/outro', 'F1-01', PT)).toEqual({ error: 'executar: plano desconhecido /outro' });
    expect(actionTarget([FAILED_PLAN], FAILED_PLAN.folder, 'F1-01', PT)).toEqual({ error: 'executar: mau sem estado lido — EACCES' });
  });

  it('run plan only asks for the plan from the last read, even with a state error', () => {
    expect(actionTarget([BH], BH.folder)).toMatchObject({ plan: { name: 'bh' } });
    expect(actionTarget([FAILED_PLAN], FAILED_PLAN.folder)).toMatchObject({ plan: { name: 'mau' } });
    expect(actionTarget([BH], '/outro', undefined, PT)).toEqual({ error: 'conduzir: plano desconhecido /outro' });
  });
});

interface Options {
  plugin?: boolean;
  answer?: ModalOption | undefined;
}

/** The simulated dependencies, with the Claude Code provider prompts. */
function fake(o: Options = {}): ActionDeps & { steps: string[]; notices: PlanNotice[]; channelInfo: string[]; agentFolders: string[] } {
  const steps: string[] = [];
  const notices: PlanNotice[] = [];
  const channelInfo: string[] = [];
  const agentFolders: string[] = [];
  return {
    steps,
    agentFolders,
    notices,
    channelInfo,
    strings: PT,
    prompt: claudeCodePrompt,
    plugin: async () => {
      steps.push('plugin');
      return o.plugin ?? true;
    },
    ask: async (notice, actions) => {
      notices.push(notice);
      steps.push(`perguntar ${actions.join('|')}`);
      return o.answer;
    },
    openAgent: async (prompt, folder) => {
      steps.push(`agente ${prompt}`);
      agentFolders.push(folder);
      return 'copied';
    },
    channel: { info: (t) => channelInfo.push(t), warn: (t) => channelInfo.push(`warn ${t}`) },
  };
}

describe('execute', () => {
  it('in a plan without an entry skill: plugin required and opens /plan-relay:plan <plan> <ID>', async () => {
    const d = fake();
    expect(await execute(BH, task('F1-01', 'available'), d)).toBe('opened');
    expect(d.steps).toEqual(['plugin', 'agente /plan-relay:plan bh F1-01']);
    expect(d.channelInfo).toContain('executar: bh F1-01 (available) → copiado');
  });

  it('in progress is "Resume", with the same prompt', async () => {
    const d = fake();
    expect(await execute(BH, task('F1-03', 'in-progress'), d)).toBe('opened');
    expect(d.steps.at(-1)).toBe('agente /plan-relay:plan bh F1-03');
    expect(d.channelInfo).toContain('retomar: bh F1-03 (in-progress) → copiado');
  });

  it('plugin declined (Cancel) stops before the agent', async () => {
    const d = fake({ plugin: false });
    expect(await execute(BH, task('F1-02', 'owner'), d)).toBe('no-plugin');
    expect(d.steps).toEqual(['plugin']);
  });

  it('without a provider that can open, the action copies the prompt and says so', async () => {
    const copied: string[] = [];
    const notices: string[] = [];
    const d = fake();
    d.openAgent = (prompt) =>
      openWithPrompt({ name: 'Agente X' }, prompt, {
        copy: async (t) => {
          copied.push(t);
        },
        alert: (t) => notices.push(t),
        channel: { info: () => {} },
        strings: PT,
      });
    expect(await execute(BH, task('F1-01', 'available'), d)).toBe('opened');
    expect(copied).toEqual(['/plan-relay:plan bh F1-01']);
    expect(notices).toEqual(['O prompt foi copiado — cole-o na caixa do Agente X.']);
    expect(d.channelInfo).toContain('executar: bh F1-01 (available) → copiado');
  });
});

describe('run', () => {
  it('without an open autopilot: plugin required and opens /plan-relay:run agent_plans/<name>', async () => {
    const d = fake();
    expect(await run(BH, null, d)).toBe('opened');
    expect(d.steps).toEqual(['plugin', 'agente /plan-relay:run agent_plans/bh']);
    expect(d.channelInfo).toContain('conduzir: bh → copiado');
  });

  it('a closed autopilot does not ask', async () => {
    const d = fake();
    await run(BH, { log: 'notes/run-2026-11-12.md', open: false }, d);
    expect(d.notices).toEqual([]);
  });

  it('without the plugin it stops before the modal', async () => {
    const d = fake({ plugin: false });
    expect(await run(BH, { log: 'notes/run-2026-11-13.md', open: true }, d)).toBe('no-plugin');
    expect(d.steps).toEqual(['plugin']);
  });

  it('with an open autopilot it asks, and "Run plan" proceeds', async () => {
    const d = fake({ answer: 'run' });
    expect(await run(BH, { log: 'notes/run-2026-11-13.md', open: true }, d)).toBe('opened');
    expect(d.steps).toEqual(['plugin', 'perguntar run', 'agente /plan-relay:run agent_plans/bh']);
    expect(d.notices[0]?.text).toBe('Há uma corrida aberta (notes/run-2026-11-13.md); conduzir retoma-a.');
    expect(d.notices[0]?.strong).toBe(true);
  });

  it('with an open autopilot, Cancel opens nothing', async () => {
    const d = fake({ answer: undefined });
    expect(await run(BH, { log: 'notes/run-2026-11-13.md', open: true }, d)).toBe('cancelled');
    expect(d.steps).toEqual(['plugin', 'perguntar run']);
    expect(d.channelInfo).toContain('conduzir: resposta Cancelar');
  });
});

describe('copiarComando', () => {
  /** A fake provider: the command text is the provider's, and the page never knows it. */
  function fakeProvider() {
    const copied: string[] = [];
    const notices: string[] = [];
    const info: string[] = [];
    const deps = {
      prompt: (action: Parameters<ActionDeps['prompt']>[0]) => `FALSO ${JSON.stringify(action)}`,
      copy: (text: string) => {
        copied.push(text);
        return Promise.resolve();
      },
      alert: (text: string) => notices.push(text),
      channel: { info: (text: string) => info.push(text) },
      strings: PT,
    };
    return { deps, copied, notices, info };
  }

  it('without id it copies the plan run command and notifies', async () => {
    const f = fakeProvider();
    expect(await copyCommand(BH, undefined, f.deps)).toBe('FALSO {"run":"bh"}');
    expect(f.copied).toEqual(['FALSO {"run":"bh"}']);
    expect(f.notices).toEqual(['O comando foi copiado.']);
    expect(f.info[0]).toContain('bh');
  });

  it('with id it copies the task command', async () => {
    const f = fakeProvider();
    await copyCommand(BH, 'F1-03', f.deps);
    expect(f.copied).toEqual(['FALSO {"plan":"bh","id":"F1-03"}']);
  });
});

describe('the session folder', () => {
  it('run and run plan tell the agent which workspace folder the plan is in', async () => {
    const d = fake();
    await execute(BH, task('F1-01', 'available'), d);
    await run(BH, null, d);
    expect(d.agentFolders).toEqual(['/ws', '/ws']);
  });
});

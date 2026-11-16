import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deleteFromCard, mapIdea, type FlowDeps } from './flow';
import type { PlanNotice, PlanWithOrigin } from './map';
import type { ModalOption } from './modal';
import { stringsFor } from '@plan-relay/i18n';
import { claudeCodePrompt } from '../agents/claude-code/prompts';

const PT = stringsFor('pt-BR');

const WS = '/ws/projeto';
const MD = join(WS, 'PLANO-X.md');
const ACCOUNTS_PLAN: PlanWithOrigin = {
  workspaceFolder: WS,
  name: 'conta',
  folder: join(WS, 'agent_plans', 'conta'),
  origin: 'PLANO-X.md',
};

interface Options {
  plans?: PlanWithOrigin[];
  answer?: ModalOption;
  plugin?: boolean;
  deleteOk?: boolean;
  work?: { running: number; runOpen: boolean };
}

function fake(o: Options = {}): FlowDeps & { steps: string[]; notices: PlanNotice[]; agentFolders: string[] } {
  const steps: string[] = [];
  const agentFolders: string[] = [];
  const notices: PlanNotice[] = [];
  return {
    steps,
    notices,
    agentFolders,
    folders: () => [WS],
    discoverAll: async () => o.plans ?? [],
    work: async () => o.work ?? { running: 0, runOpen: false },
    ask: async (notice, actions) => {
      notices.push(notice);
      steps.push(`perguntar ${actions.join('|')}`);
      return o.answer;
    },
    pluginActive: async () => {
      steps.push('plugin');
      return o.plugin ?? true;
    },
    remove: async (_root, folder) => {
      steps.push(`apagar ${folder}`);
      return o.deleteOk === false ? { ok: false, error: 'falhou', deleted: [] } : { ok: true, deleted: [folder] };
    },
    openExisting: async (p) => {
      steps.push(`existente ${p.name}`);
    },
    prompt: claudeCodePrompt,
    openAgent: async (prompt, folder) => {
      steps.push(`agente ${prompt}`);
      agentFolders.push(folder);
      return 'copied';
    },
    requestLoad: () => steps.push('carga'),
    alert: (t) => steps.push(`avisar ${t}`),
    error: (t) => steps.push(`erro ${t}`),
    channel: { info: () => {}, warn: () => {} },
    strings: PT,
  };
}

describe('map', () => {
  it('no existing plan → checks the plugin and opens the agent', async () => {
    const d = fake();
    expect(await mapIdea(MD, d)).toBe('opened');
    expect(d.steps).toEqual(['plugin', 'agente /plan-relay:map PLANO-X.md']);
  });

  it('plugin declined → stops before the agent', async () => {
    const d = fake({ plugin: false });
    expect(await mapIdea(MD, d)).toBe('no-plugin');
    expect(d.steps).toEqual(['plugin']);
  });

  it('outside the workspace → notifies and stops', async () => {
    const d = fake();
    expect(await mapIdea('/fora/P.md', d)).toBe('outside');
    expect(d.steps).toEqual([expect.stringMatching(/^avisar /)]);
  });

  it('existing plan, cancel → nothing else', async () => {
    const d = fake({ plans: [ACCOUNTS_PLAN] });
    expect(await mapIdea(MD, d)).toBe('cancelled');
    expect(d.steps).toEqual(['perguntar open-existing|delete-and-map']);
  });

  it('existing plan, open the existing one → opens it, without plugin or agent', async () => {
    const d = fake({ plans: [ACCOUNTS_PLAN], answer: 'open-existing' });
    expect(await mapIdea(MD, d)).toBe('existing');
    expect(d.steps.slice(1)).toEqual(['existente conta']);
  });

  it('delete and map again → plugin before deleting, then refresh and agent', async () => {
    const d = fake({ plans: [ACCOUNTS_PLAN], answer: 'delete-and-map', work: { running: 2, runOpen: true } });
    expect(await mapIdea(MD, d)).toBe('opened');
    expect(d.steps.slice(1)).toEqual(['plugin', `apagar ${ACCOUNTS_PLAN.folder}`, 'carga', 'agente /plan-relay:map PLANO-X.md']);
    expect(d.notices[0]?.strong).toBe(true);
    expect(d.notices[0]?.detail).toContain('2 tasks em andamento');
  });

  it('delete and map with the plugin declined → nothing is deleted', async () => {
    const d = fake({ plans: [ACCOUNTS_PLAN], answer: 'delete-and-map', plugin: false });
    expect(await mapIdea(MD, d)).toBe('no-plugin');
    expect(d.steps.some((p) => p.startsWith('delete'))).toBe(false);
  });

  it('delete fails → error, refresh, and does not open the agent', async () => {
    const d = fake({ plans: [ACCOUNTS_PLAN], answer: 'delete-and-map', deleteOk: false });
    expect(await mapIdea(MD, d)).toBe('error');
    expect(d.steps.slice(-2)).toEqual(['carga', 'erro Plan Relay: falhou']);
  });
});

describe('deleteFromCard', () => {
  it('asks with "Delete" as the only action; confirmed → deletes and requests a refresh', async () => {
    const d = fake({ answer: 'delete' });
    expect(await deleteFromCard(ACCOUNTS_PLAN, d)).toBe('deleted');
    expect(d.steps).toEqual(['perguntar delete', `apagar ${ACCOUNTS_PLAN.folder}`, 'carga']);
    expect(d.notices[0]?.text).toContain('Apagar o plano «conta»');
  });

  it('cancelled → nothing', async () => {
    const d = fake();
    expect(await deleteFromCard(ACCOUNTS_PLAN, d)).toBe('cancelled');
    expect(d.steps).toEqual(['perguntar delete']);
  });

  it('error deleting → error message', async () => {
    const d = fake({ answer: 'delete', deleteOk: false });
    expect(await deleteFromCard(ACCOUNTS_PLAN, d)).toBe('error');
    expect(d.steps.at(-1)).toBe('erro Plan Relay: falhou');
  });
});

describe('map — the session folder', () => {
  it('tells the agent which workspace folder the .md is in', async () => {
    const d = fake();
    await mapIdea(MD, d);
    expect(d.agentFolders).toEqual([WS]);
  });
});

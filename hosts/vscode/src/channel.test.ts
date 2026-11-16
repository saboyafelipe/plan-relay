// The «Plan Relay» channel in English carries no Portuguese internal code: a manual run with VS Code in `en` once
// showed `webview: pronto`, `refreshed (arquivo)`, `plugin: ativo-projeto`, `→ comando`… In pt-BR the same lines
// come out as they always did.
import { describe, expect, it } from 'vitest';
import { stringsFor, type Strings } from '@plan-relay/i18n';
import type { PluginView } from '@plan-relay/panel';
import { actionTarget, run, execute, type ActionDeps } from './actions/execute';
import { refreshLines } from './refresh/log-lines';
import { pluginLine, inChannel } from './channel';
import type { LoadedPlan } from './plans/load';

/** The internal codes that reach the channel, with the Portuguese code each one shows in pt-BR. */
const CODES: Readonly<Record<string, string>> = {
  // webview message type and action name
  ready: 'pronto',
  refresh: 'atualizar',
  install: 'instalar',
  uninstall: 'desinstalar',
  open: 'abrir',
  delete: 'apagar',
  execute: 'executar',
  resume: 'retomar',
  giveUp: 'desistir',
  reopen: 'reabrir',
  run: 'conduzir',
  copy: 'copiar',
  tab: 'aba',
  map: 'mapear',
  refine: 'afinar',
  // load reason
  activation: 'ativacao',
  file: 'arquivo',
  interval: 'intervalo',
  command: 'comando',
  button: 'botao',
  // plugin state
  'active-project': 'ativo-projeto',
  'active-user': 'ativo-usuario',
  inactive: 'inativo',
  'not-installed': 'nao-instalado',
  error: 'erro',
  checking: 'a-verificar',
  installing: 'a-instalar',
  // origin of the marketplace source and of the binary
  configured: 'configurado',
  known: 'conhecido',
  default: 'padrao',
  setting: 'configuracao',
  'official-extension': 'extensao-oficial',
  // how an action ended
  copied: 'copiado',
  applied: 'aplicado',
  cancelled: 'cancelado',
  refused: 'recusado',
  changed: 'mudou',
  reopened: 'reaberto',
};
const PT_CODES = Object.values(CODES);

const REASONS = ['activation', 'file', 'interval', 'command', 'button', 'ready'] as const;
const STATES: PluginView[] = [
  { state: 'checking' },
  { state: 'installing' },
  { state: 'not-installed' },
  { state: 'inactive', scope: 'user' },
  { state: 'active-project', scope: 'project' },
  { state: 'active-user', scope: 'user' },
  { state: 'error', error: 'boom' },
];

/** The Portuguese codes that appear in a line as a whole word (no letter or hyphen attached). */
function ptCodes(line: string): string[] {
  return PT_CODES.filter((c) => new RegExp(`(?<![\\p{L}-])${c}(?![\\p{L}-])`, 'u').test(line));
}

const PLAN = {
  workspaceFolder: '/ws',
  name: 'zeta',
  folder: '/ws/agent_plans/zeta',
  status: { tasks: [{ id: 'T1', group: 'available' }], progress: { in_progress: 0, done: 0 } },
} as unknown as LoadedPlan;

/** The channel lines the pure modules build, in one language. */
async function lines(strings: Strings): Promise<string[]> {
  const output: string[] = [];
  for (const m of REASONS) {
    for (const l of refreshLines(m, [], strings)) output.push(l.text);
    for (const l of refreshLines(m, [PLAN], strings)) output.push(l.text);
  }
  for (const e of STATES) output.push(pluginLine(e, strings));
  for (const c of Object.keys(CODES)) output.push(`webview: ${inChannel(c, strings)}`);
  const r = actionTarget([PLAN], '/other', 'T1', strings);
  if ('error' in r) output.push(r.error);
  const channel = { info: (t: string) => output.push(t), warn: (t: string) => output.push(t) };
  for (const path of ['command', 'uri', 'copied']) {
    const deps: ActionDeps = {
      prompt: () => '/q',
      plugin: async () => true,
      ask: async () => undefined,
      openAgent: async () => path,
      channel,
      strings,
    };
    await execute(PLAN, { id: 'T1', group: 'available' }, deps);
    await execute(PLAN, { id: 'T1', group: 'in-progress' }, deps);
    await run(PLAN, { open: true, log: 'q.md' }, deps);
    await run(PLAN, null, deps);
    await execute(PLAN, { id: 'T1', group: 'available' }, { ...deps, plugin: async () => false });
    await run(PLAN, null, { ...deps, plugin: async () => false });
  }
  return output;
}

describe('the channel in English has no Portuguese internal code', () => {
  it('en: no line has a Portuguese code', async () => {
    const output = await lines(stringsFor('en'));
    expect(output.length).toBeGreaterThan(60);
    expect(output.filter((l) => ptCodes(l).length > 0)).toEqual([]);
  });

  it('en: every code is written as itself, in kebab-case', () => {
    const en = stringsFor('en');
    const kebab = (c: string) => c.replace(/[A-Z]/g, (u) => `-${u.toLowerCase()}`);
    expect(Object.keys(CODES).filter((c) => inChannel(c, en) !== kebab(c))).toEqual([]);
  });

  it('pt-BR: the codes and the lines come out as before', async () => {
    const pt = stringsFor('pt-BR');
    for (const [code, ptCode] of Object.entries(CODES)) expect(inChannel(code, pt), code).toBe(ptCode);
    expect(pluginLine({ state: 'active-project', scope: 'project' }, pt)).toBe('plugin: ativo-projeto');
    expect(pluginLine({ state: 'error', error: 'boom' }, pt)).toBe('plugin: erro — boom');
    const output = await lines(pt);
    expect(output).toContain('executar: zeta T1 (available) → comando');
    expect(output).toContain('retomar: zeta T1 (in-progress) → copiado');
    expect(output).toContain('conduzir: zeta → uri');
  });

  it('a code without a key comes out as is', () => {
    expect(inChannel('workspace', stringsFor('en'))).toBe('workspace');
    expect(inChannel('ideaRefine', stringsFor('en'))).toBe('ideaRefine');
  });
});

// Extension flows in the test language: modals, notices, output channel and errors come from core/i18n,
// and no piece of pt-BR text is left over. The data (plan name, paths, ids) is ASCII with no pt-BR word.
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import ptBR from '@plan-relay/i18n/pt-BR.json';
import xTest from '@plan-relay/i18n/x-test.json';
import { createStrings, stringsFor, type Strings } from '@plan-relay/i18n';
import { deletePlan, type DeleteFs } from './actions/delete';
import { actionTarget, run, execute, type ActionDeps } from './actions/execute';
import { deleteFromCard, mapIdea, type FlowDeps } from './actions/flow';
import { askForOption, optionLabels, type ModalOption } from './actions/modal';
import { refreshLines } from './refresh/log-lines';
import { openClaude } from './agents/claude-code/open';
import { decidePluginState } from './agents/claude-code/plugin-state';
import { claudeCodePrompt } from './agents/claude-code/prompts';
import { openWithPrompt, otherFolderNotice } from './agents/provider';
import type { LoadedPlan } from './plans/load';
import type { ReaderError } from './plans/contract';
import { runProcess } from './process';

// The language in use: each describe switches it before its cases (the cases of one language run in sequence).
let X: Strings = createStrings('x-test', xTest);
const WS = '/ws/qq';
const ZETA = { workspaceFolder: WS, name: 'zeta', folder: join(WS, 'agent_plans', 'zeta'), origin: 'Z.md' };

/** The pieces of each pt-BR string without the arguments, with at least one letter. */
const PT_PIECES = Object.values(ptBR)
  .flatMap((t) => t.split(/\{\d+\}/))
  .map((s) => s.trim())
  .filter((s) => /\p{L}{2}/u.test(s));

/** Everything a flow shows or writes: channel, notices, errors, modals (text, detail and labels). */
function collector() {
  const output: string[] = [];
  const channel = { info: (t: string) => output.push(t), warn: (t: string) => output.push(t) };
  const ask = (answer: ModalOption | undefined) => async (notice: { text: string; detail: string }, options: readonly ModalOption[]) => {
    output.push(notice.text, notice.detail);
    await askForOption(async (labels) => (output.push(...labels), undefined), options, optionLabels(X));
    return answer;
  };
  return { output, channel, ask };
}

function fsThat(exists: boolean, remove: () => Promise<void>): DeleteFs {
  return { exists: async () => exists, realpath: async (path) => path, remove };
}

function flowDeps(
  c: ReturnType<typeof collector>,
  answer: ModalOption | undefined,
  fs: DeleteFs,
  work?: { running: number; runOpen: boolean },
): FlowDeps {
  return {
    folders: () => [WS],
    discoverAll: async () => [ZETA],
    work: async () => work,
    ask: c.ask(answer),
    pluginActive: async () => true,
    remove: (root, folder) => deletePlan(root, folder, fs, X),
    openExisting: async () => {},
    prompt: claudeCodePrompt,
    openAgent: (prompt) =>
      openWithPrompt(undefined, prompt, { copy: async () => {}, alert: (t) => c.output.push(t), channel: c.channel, strings: X }),
    requestLoad: () => {},
    alert: (t) => c.output.push(t),
    error: (t) => c.output.push(t),
    channel: c.channel,
    strings: X,
  };
}

/**
 * The lines where a pt-BR piece (whole word) is left after removing the `x-test:<key>` and the channel
 * labels (`conduzir:`, `claude:`…: the line's origin, an identifier such as the action or the module).
 */
function withPt(output: string[]): string[] {
  const rest = (s: string) => s.replace(/x-test:[\w.-]+/g, ' ').replace(/\b[a-z]+:(?=\s)/g, ' ');
  const word = (p: string) => new RegExp(`(?<![\\p{L}])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u');
  return output.filter((s) => PT_PIECES.some((p) => word(p).test(rest(s))));
}

async function mapFlow(): Promise<string[]> {
  const c = collector();
  await mapIdea(
    '/fora/Z.md',
    flowDeps(
      c,
      undefined,
      fsThat(true, async () => {}),
    ),
  );
  // Unreadable state (strong notice), "Delete and map again", the folder no longer exists.
  await mapIdea(
    join(WS, 'Z.md'),
    flowDeps(
      c,
      'delete-and-map',
      fsThat(false, async () => {}),
    ),
  );
  // Work running, "Delete", the delete fails.
  const failure = fsThat(true, () => Promise.reject(new Error('boom')));
  await deleteFromCard(ZETA, flowDeps(c, 'delete', failure, { running: 2, runOpen: true }));
  await deleteFromCard(
    ZETA,
    flowDeps(
      c,
      'delete',
      fsThat(true, async () => {}),
      { running: 1, runOpen: false },
    ),
  );
  return c.output;
}

async function executeFlow(): Promise<string[]> {
  const c = collector();
  const plan = {
    workspaceFolder: WS,
    name: 'zeta',
    folder: ZETA.folder,
    status: { tasks: [{ id: 'T1', group: 'blocked' }] },
  } as unknown as LoadedPlan;
  for (const [id, p] of [
    ['T1', 'zz'],
    ['T9', ZETA.folder],
    ['T1', ZETA.folder],
  ] as const) {
    const r = actionTarget([plan], p, id, X);
    if ('error' in r) c.output.push(r.error);
  }
  const deps: ActionDeps = {
    prompt: claudeCodePrompt,
    plugin: async () => true,
    ask: c.ask('run'),
    openAgent: (prompt) =>
      openWithPrompt({ name: 'Qx' }, prompt, { copy: async () => {}, alert: (t) => c.output.push(t), channel: c.channel, strings: X }),
    channel: c.channel,
    strings: X,
  };
  await run(plan, { open: true, log: 'q.md' }, deps);
  await execute(plan, { id: 'T1', group: 'available' }, { ...deps, plugin: async () => false });
  const other = otherFolderNotice('Qx', '/ws/rr', [WS, '/ws/rr'], X);
  if (other) c.output.push(other);
  return c.output;
}

async function agentFlow(): Promise<string[]> {
  const c = collector();
  await openClaude('/q', {
    executeCommand: () => Promise.reject(new Error('boom')),
    extensionInstalled: () => true,
    trustedWorkspace: () => false,
    openUri: async () => false,
    copy: async () => {},
    alert: (t) => c.output.push(t),
    channel: c.channel,
    strings: X,
  });
  const e = decidePluginState('{', [WS], X);
  if (e.state === 'error') c.output.push(e.error);
  const p = await runProcess('/ws/qq/nada', [], { cwd: '/', timeoutMs: 5000, name: 'qq', strings: X });
  if ('error' in p) c.output.push(p.error);
  for (const l of refreshLines('activation', [], X)) c.output.push(l.text);
  // The reader error reaches the channel by code, with the cause translated too.
  const bad = { workspaceFolder: '/ws', name: 'qq', folder: '/ws/agent_plans/qq' };
  const error: ReaderError = { code: 'invalid', args: ['plan.json'], cause: { code: 'notObject', args: ['plan.json'] } };
  for (const l of refreshLines('activation', [{ ...bad, error }], X)) c.output.push(l.text);
  return c.output;
}

describe('the extension in the test language', () => {
  beforeAll(() => {
    X = createStrings('x-test', xTest);
  });

  it('map and delete: modals, notices, errors and channel', async () => {
    const output = await mapFlow();
    expect(output.length).toBeGreaterThan(15);
    expect(withPt(output)).toEqual([]);
    expect(output.join('\n')).toContain('x-test:option.delete-and-map');
    expect(output.join('\n')).toContain('x-test:notice.workRunning');
  });

  it('run and drive: target, open run and copied prompt', async () => {
    const output = await executeFlow();
    expect(withPt(output)).toEqual([]);
    expect(output.join('\n')).toContain('x-test:notice.runOpenResume');
  });

  it('agent, process and update channel', async () => {
    const output = await agentFlow();
    expect(output.join('\n')).toContain('x-test:reader.invalid plan.json x-test:reader.notObject plan.json');
    expect(withPt(output)).toEqual([]);
    expect(output.join('\n')).toContain('x-test:provider.restricted');
    expect(output.join('\n')).toContain('x-test:process.didNotStart');
  });
});

/** What English has identical to pt-BR because they are words in both languages (explicit list). */
const SAME_IN_BOTH = ['Plan Relay', 'Plan Relay:', 'plugin', 'Plugin', 'task', 'tasks', 'sh', 'git', 'jq', 'min', 'h', 'd'];
const PT_EN_PIECES = PT_PIECES.filter((p) => !SAME_IN_BOTH.includes(p));

describe('the extension in English', () => {
  beforeAll(() => {
    X = stringsFor('en');
  });

  it('the language is en and no output carries a piece of pt-BR text', async () => {
    expect(X.language).toBe('en');
    const word = (p: string) => new RegExp(`(?<![\\p{L}])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u');
    for (const flow of [mapFlow, executeFlow, agentFlow]) {
      const output = await flow();
      expect(output.length).toBeGreaterThan(3);
      const rest = (s: string) => s.replace(/\b[a-z]+:(?=\s)/g, ' ');
      expect(output.flatMap((s) => PT_EN_PIECES.filter((p) => word(p).test(rest(s))).map((p) => p + ' @ ' + s))).toEqual([]);
    }
  });
});

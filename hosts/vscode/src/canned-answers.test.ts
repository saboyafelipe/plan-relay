import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlan, temporaryFolder } from '@plan-relay/reader/testing';
import { answersOf } from './canned-answers';
import { PanelActions } from './actions/panel';
import { VIEW } from './agent';
import { activateHost, type ActiveHost } from './testing/context';
import { ExtensionMode, Uri, fake } from './testing/vscode';

// Values of `vscode.ExtensionMode`, written out so a wrong fake cannot hide a wrong guard; a test checks them.
const PRODUCTION = 1;
const DEVELOPMENT = 2;
const TEST = 3;

describe('answersOf (the canned answers only apply in Development and Test)', () => {
  it('in production, `Respostas` does not skip the confirmation: delete with {resposta: "delete"} still asks', () => {
    expect(answersOf({ answer: 'delete' }, PRODUCTION)).toBeUndefined();
    expect(answersOf({ answer: null, install: 'user' }, PRODUCTION)).toBeUndefined();
  });

  it('in test and development, the answers go through', () => {
    expect(answersOf({ answer: 'delete' }, TEST)).toEqual({ answer: 'delete', install: undefined });
    expect(answersOf({ answer: null, install: false }, DEVELOPMENT)).toEqual({ answer: null, install: false });
  });

  it('an unknown mode counts as production', () => {
    expect(answersOf({ answer: 'delete' }, 99 as never)).toBeUndefined();
  });

  it('what is not an object, or carries unexpected values, does not become an answer', () => {
    expect(answersOf(undefined, TEST)).toBeUndefined();
    expect(answersOf(['delete'], TEST)).toBeUndefined();
    expect(answersOf({ answer: 1, install: 'tudo' }, TEST)).toEqual({ answer: undefined, install: undefined });
    expect(answersOf({ reason: 7 }, TEST)?.reason).toBeUndefined();
  });

  it('the reason for giving up goes through as text, and null is Esc in the box', () => {
    expect(answersOf({ answer: 'give-up', reason: 'Sem máquina Windows' }, TEST)?.reason).toBe('Sem máquina Windows');
    expect(answersOf({ reason: null }, TEST)?.reason).toBeNull();
    expect(answersOf({ reason: 'x' }, PRODUCTION)).toBeUndefined();
  });

  it('the numbers are those of vscode.ExtensionMode, in the declarations and in the fake the tests use', () => {
    const dts = readFileSync(createRequire(import.meta.url).resolve('@types/vscode/index.d.ts'), 'utf8');
    const body = /export enum ExtensionMode \{([\s\S]*?)\n\t\}/.exec(dts)?.[1] ?? '';
    expect(body).toMatch(/Production = 1,/);
    expect(body).toMatch(/Development = 2,/);
    expect(body).toMatch(/Test = 3,?/);
    expect(ExtensionMode).toEqual({ Production: PRODUCTION, Development: DEVELOPMENT, Test: TEST });
  });
});

const GIVEN = { answer: 'delete', install: 'user', reason: 'Sem máquina Windows' };

/** Each command that accepts answers, the arguments before them, and the action that receives them last. */
const COMMANDS: [string, unknown[], 'mapIdea' | 'remove' | 'execute' | 'run' | 'giveUp' | 'reopen'][] = [
  ['planRelay.map', [Uri.file('/ws/IDEIA.md'), undefined], 'mapIdea'],
  ['planRelay.deletePlan', ['/ws/agent_plans/p'], 'remove'],
  ['planRelay.runTask', ['/ws/agent_plans/p', 'F1-01'], 'execute'],
  ['planRelay.runPlan', ['/ws/agent_plans/p'], 'run'],
  ['planRelay.giveUpTask', ['/ws/agent_plans/p', 'F1-01'], 'giveUp'],
  ['planRelay.reopenTask', ['/ws/agent_plans/p', 'F1-01'], 'reopen'],
];

describe('the registered commands and the canned answers', () => {
  let host: ActiveHost | undefined;
  afterEach(() => {
    host?.dispose();
    host = undefined;
    vi.restoreAllMocks();
  });

  it.each(COMMANDS)('in production, %s does not hand the answers to the action', async (command, args, method) => {
    const action = vi.spyOn(PanelActions.prototype, method).mockResolvedValue(undefined);
    host = activateHost({ mode: PRODUCTION });
    await fake.run(command, ...args, GIVEN);
    expect(action).toHaveBeenCalledOnce();
    expect(action.mock.lastCall?.at(-1)).toBeUndefined();
  });

  it.each(COMMANDS)('in test, %s hands the answers to the action', async (command, args, method) => {
    const action = vi.spyOn(PanelActions.prototype, method).mockResolvedValue(undefined);
    host = activateHost({ mode: TEST });
    await fake.run(command, ...args, GIVEN);
    expect(action.mock.lastCall?.at(-1)).toEqual({ answer: 'delete', install: 'user', reason: 'Sem máquina Windows' });
  });

  describe('deleting a plan by command with { answer: "delete" }', () => {
    let tmp: ReturnType<typeof temporaryFolder>;
    beforeEach(() => {
      tmp = temporaryFolder();
    });
    afterEach(() => tmp.remove());

    /** Activates the host on a workspace with one plan and waits for the page to receive it; returns the plan's id. */
    async function withPlan(mode: number): Promise<string> {
      const folder = createPlan(tmp.folder);
      host = activateHost({ mode });
      fake.openFolders(tmp.folder);
      const view = fake.resolveView(VIEW);
      view.webview.receive({ type: 'ready' });
      await vi.waitFor(() => expect(view.webview.types()).toContain('status'), { timeout: 3000 });
      return folder;
    }

    it('in production, it still asks, and closing the modal keeps the plan', async () => {
      const folder = await withPlan(PRODUCTION);
      await fake.run('planRelay.deletePlan', folder, { answer: 'delete' });
      expect(fake.shown.filter((s) => s.severity === 'warning' && (s.options as { modal?: boolean } | undefined)?.modal)).toHaveLength(1);
      expect(existsSync(folder)).toBe(true);
    });

    it('in test, it deletes without asking', async () => {
      const folder = await withPlan(TEST);
      await fake.run('planRelay.deletePlan', folder, { answer: 'delete' });
      expect(fake.shown.filter((s) => (s.options as { modal?: boolean } | undefined)?.modal)).toEqual([]);
      expect(existsSync(folder)).toBe(false);
    });
  });
});

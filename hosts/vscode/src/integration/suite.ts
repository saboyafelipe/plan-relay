// The integration test cases, run inside the VS Code that run-tests.ts opens (`run` is what
// `--extensionTestsPath` calls). No mocha: each case is a function, and a failing one makes `run` reject.
import * as assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
// The command the Claude Code provider uses to open the official extension. It comes from the provider (the Claude
// Code identifiers only live there, architecture.test.ts); this test does not prove the official extension has it.
import { CLAUDE_COMMAND } from '../agents/claude-code/open';
import type { TestApi } from '../webview-probe';

// The extension ID (publisher.name) is read from package.json (out/integration/ → ../../): changing the publisher does not break the test.
const MANIFEST = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as { publisher: string; name: string };
const EXTENSION_ID = `${MANIFEST.publisher}.${MANIFEST.name}`;
const PUBLIC_COMMANDS = [
  'planRelay.show',
  'planRelay.refresh',
  'planRelay.installPlugin',
  'planRelay.uninstallPlugin',
  'planRelay.windowGate',
  'planRelay.map',
];
const PLAN = 'site-de-receitas';
/** An `available` task from the example: it has the "Run" button. */
const TASK = 'F1-01';

async function wait<T>(what: string, ms: number, attempt: () => Promise<T | undefined> | T | undefined): Promise<T> {
  const finished = Date.now() + ms;
  for (;;) {
    const value = await attempt();
    if (value !== undefined) return value;
    if (Date.now() > finished) throw new Error(`${ms} ms passed waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

const testCases: Record<string, () => Promise<void>> = {
  // Without calling `activate()`: what activates it is the package.json `workspaceContains`. It must be the first case:
  // an extension command would activate it. In the round with `agent_plans/` in `.gitignore` the glob search does not
  // find the plan, and what activates it is `workspaceContains:agent_plans`, checked without a search.
  'activates in a workspace with agent_plans/*/plan.json': async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `extension ${EXTENSION_ID} not loaded`);
    await wait('activation', 20_000, () => (extension.isActive ? true : undefined));
  },

  'registers the public commands': async () => {
    const all = new Set(await vscode.commands.getCommands(true));
    const missing = PUBLIC_COMMANDS.filter((c) => !all.has(c));
    assert.deepEqual(missing, [], `missing commands: ${missing.join(', ')}`);
  },

  // The panel only reads the plans after the view resolves (the schedule waits for it): a delivered prompt proves both.
  // "Run" with the plugin active (the fake `claude`) calls the official extension's command with the prompt.
  '"Run" hands /plan-relay:plan <plan> <ID> to the agent': async () => {
    const workspace = process.env.PLAN_RELAY_INTEGRATION_WORKSPACE;
    assert.ok(workspace, 'PLAN_RELAY_INTEGRATION_WORKSPACE is empty');
    const prompts: string[] = [];
    const registered = vscode.commands.registerCommand(CLAUDE_COMMAND, (_session: unknown, prompt: unknown) => {
      prompts.push(String(prompt));
    });
    try {
      await vscode.commands.executeCommand('planRelay.show');
      const folder = join(workspace, 'agent_plans', PLAN);
      // `install: false`: if the plugin is not active, it stops instead of opening the modal (which would hang the test).
      const prompt = await wait('the "Run" prompt', 30_000, async () => {
        await vscode.commands.executeCommand('planRelay.runTask', folder, TASK, { install: false });
        return prompts[0];
      });
      assert.equal(prompt, `/plan-relay:plan ${PLAN} ${TASK}`);
    } finally {
      registered.dispose();
    }
  },

  // "Give up" and "Reopen" with the modal and the reason box answered by the canned answers. They run after
  // "Run", which waits for the panel to read the plan: the actions only act on plans from the last read.
  '"Give up" refuses the in-progress task and writes nothing': async () => {
    const folder = planFolder();
    const before = statusOf(folder);
    await vscode.commands.executeCommand('planRelay.giveUpTask', folder, 'F0-03', {
      answer: 'give-up',
      reason: 'Sem máquina disponível',
    });
    assert.deepEqual(statusOf(folder), before);
  },

  '"Give up" with an invalid reason writes nothing': async () => {
    const folder = planFolder();
    const before = statusOf(folder);
    await vscode.commands.executeCommand('planRelay.giveUpTask', folder, 'F1-02', { answer: 'give-up', reason: 'aaa bbb 111 ---' });
    assert.deepEqual(statusOf(folder), before);
  },

  'an applied "Give up" abandons the closing task, and "Reopen" brings it back': async () => {
    const folder = planFolder();
    const before = statusOf(folder);
    await vscode.commands.executeCommand('planRelay.giveUpTask', folder, 'F1-02', {
      answer: 'give-up',
      reason: 'Sem máquina disponível',
    });
    const after = statusOf(folder);
    assert.deepEqual(
      Object.keys(after).filter((id) => after[id] === 'abandoned' && before[id] !== 'abandoned'),
      ['F1-02', 'F1-03', 'F1-04'],
    );
    // The panel's last read must see the abandoned root before "Reopen".
    await wait('the read with F1-02 abandoned', 15_000, async () => {
      await vscode.commands.executeCommand('planRelay.refresh');
      await new Promise((r) => setTimeout(r, 300));
      await vscode.commands.executeCommand('planRelay.reopenTask', folder, 'F1-02', { answer: 'reopen' });
      return statusOf(folder)['F1-02'] === 'ready' ? true : undefined;
    });
    assert.deepEqual(statusOf(folder), before);
  },

  // The click path instead of the command: the panel page posts `giveUp`, the host opens the confirmation tab, the tab
  // answers "Abandon" with a reason, the plan files change and the panel gets a `status` with the task abandoned. The
  // API cannot click inside a webview, so the probe stands in for both pages (webview-probe.ts).
  '"Give up" posted by the panel page goes through the confirmation tab, writes the plan and updates the panel': async () => {
    const folder = planFolder();
    const before = statusOf(folder);
    const { probe } = testApi();
    const from = probe.posted.length;
    const handled = probe.toPanel({ type: 'giveUp', plan: folder, id: 'F1-02' });
    await wait('the confirmation tab', 15_000, () =>
      probe.toConfirmation({ type: 'abandon', reason: 'Sem máquina disponível' }) ? true : undefined,
    );
    assert.ok(await handled, 'no panel page was bound');
    const after = statusOf(folder);
    assert.deepEqual(
      Object.keys(after).filter((id) => after[id] === 'abandoned' && before[id] !== 'abandoned'),
      ['F1-02', 'F1-03', 'F1-04'],
    );
    await wait('the panel update with F1-02 abandoned', 15_000, () =>
      probe.posted.slice(from).some((m) => groupIn(m, folder, 'F1-02') === 'abandoned') ? true : undefined,
    );
    // Back to the example as it was, for whatever runs after this case.
    await wait('the reopened F1-02', 15_000, async () => {
      await vscode.commands.executeCommand('planRelay.refresh');
      await new Promise((r) => setTimeout(r, 300));
      await vscode.commands.executeCommand('planRelay.reopenTask', folder, 'F1-02', { answer: 'reopen' });
      return statusOf(folder)['F1-02'] === 'ready' ? true : undefined;
    });
    assert.deepEqual(statusOf(folder), before);
  },
};

/** What the extension returns from `activate` in Test mode. */
function testApi(): TestApi {
  const exports = vscode.extensions.getExtension<TestApi | undefined>(EXTENSION_ID)?.exports;
  assert.ok(exports?.probe, 'the extension returned no probe from activate (is it running in Test mode?)');
  return exports;
}

/** The panel group of a task in a `status` message posted to the page, or `undefined` for any other message. */
function groupIn(message: unknown, plan: string, id: string): string | undefined {
  const m = message as { type?: unknown; plans?: { id: string; tasks: { id: string; group: string }[] }[] };
  if (m.type !== 'status' || !Array.isArray(m.plans)) return undefined;
  return m.plans.find((p) => p.id === plan)?.tasks.find((t) => t.id === id)?.group;
}

function planFolder(): string {
  const workspace = process.env.PLAN_RELAY_INTEGRATION_WORKSPACE;
  assert.ok(workspace, 'PLAN_RELAY_INTEGRATION_WORKSPACE is empty');
  return join(workspace, 'agent_plans', PLAN);
}

/** The `Status:` of each plan task, read from disk, by ID. */
function statusOf(folder: string): Record<string, string> {
  const r: Record<string, string> = {};
  for (const phase of readdirSync(folder)
    .filter((d) => d.startsWith('phase-'))
    .sort()) {
    for (const fileArg of readdirSync(join(folder, phase))
      .filter((a) => /^F\d/.test(a))
      .sort()) {
      const text = readFileSync(join(folder, phase, fileArg), 'utf8');
      const id = /^# (F[\d.-]+)/m.exec(text)?.[1] ?? fileArg;
      r[id] = /^Status: (\S+)/.exec(text)?.[1] ?? '';
    }
  }
  return r;
}

export async function run(): Promise<void> {
  const failures: string[] = [];
  for (const [name, testCase] of Object.entries(testCases)) {
    try {
      await testCase();
      console.log(`  ok  ${name}`);
    } catch (error) {
      failures.push(name);
      console.log(`  FAILED  ${name}\n    ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`${Object.keys(testCases).length - failures.length}/${Object.keys(testCases).length} cases passed`);
  if (failures.length) throw new Error(`${failures.length} case(s) failed: ${failures.join('; ')}`);
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPlan, temporaryFolder } from '@plan-relay/reader/testing';
import { stringsFor } from '@plan-relay/i18n';
import { PanelActions } from './actions/panel';
import { AgentWiring, VIEW } from './agent';
import { REVEALED_KEY } from './first-run';
import { Schedule } from './refresh/schedule';
import { REVEAL_CONTAINER } from './surface';
import { WATCHED_GLOBS } from './watchers';
import { activateHost, type ActiveHost, type HostOptions } from './testing/context';
import { ExtensionMode, fake, Uri, type FakeWebviewView } from './testing/vscode';

const EN = stringsFor('en');
let host: ActiveHost | undefined;
const folders: { remove(): void }[] = [];

function start(options: HostOptions = {}): ActiveHost {
  host = activateHost(options);
  return host;
}

/** A workspace folder with one plan; removed after the test. */
function workspaceWithPlan(): { root: string; plan: string } {
  const tmp = temporaryFolder();
  folders.push(tmp);
  return { root: tmp.folder, plan: createPlan(tmp.folder) };
}

/** Waits until the page received a message of this type. */
async function received(view: { webview: FakeWebviewView['webview'] }, type: string): Promise<void> {
  await vi.waitFor(() => expect(view.webview.types()).toContain(type), { timeout: 3000 });
}

afterEach(() => {
  host?.dispose();
  host = undefined;
  for (const f of folders.splice(0)) f.remove();
  vi.restoreAllMocks();
});

describe('activate', () => {
  it('writes to its own output channel in the VS Code language', () => {
    start();
    const channel = fake.channel();
    expect(channel.name).toBe('Plan Relay');
    expect(channel.texts()).toContain(EN.t('log.enabled'));
  });

  it('each activation builds its own strings and channel: a second one in another language does not inherit the first', () => {
    start();
    const first = fake.channel();
    host?.dispose();
    start({ prepare: () => (fake.language = 'pt-br') });
    const second = fake.channel();
    expect(second).not.toBe(first);
    expect(second.texts()).toContain(stringsFor('pt-br').t('log.enabled'));
    expect(second.texts()).not.toContain(EN.t('log.enabled'));
  });

  it('registers the panel view and every command of the manifest', () => {
    start();
    expect(fake.viewProviders.has(VIEW)).toBe(true);
    for (const c of ['show', 'refresh', 'collapseAll', 'filter', 'installPlugin', 'uninstallPlugin', 'pluginStatus', 'windowGate', 'map']) {
      expect(fake.commands.has(`planRelay.${c}`), c).toBe(true);
    }
  });

  it('returns nothing outside Test mode: installed or under F5 there is no probe', () => {
    expect(start().exports).toBeUndefined();
    host?.dispose();
    expect(start({ mode: ExtensionMode.Development }).exports).toBeUndefined();
  });

  it('in Test mode the probe hands a message to the page handler and sees what the host posts back', async () => {
    const probe = start({ mode: ExtensionMode.Test }).exports?.probe;
    if (!probe) throw new Error('no probe in Test mode');
    const view = fake.resolveView(VIEW);
    await probe.toPanel({ type: 'tab', tab: 'ideas' });
    expect(fake.executed).toContainEqual({ command: 'setContext', args: ['planRelay.tab', 'ideas'] });
    await probe.toPanel({ type: 'ready' });
    expect(probe.posted).toContainEqual({ type: 'notices', notices: [] });
    expect(view.webview.posted).toContainEqual({ type: 'notices', notices: [] });
    await probe.toPanel({ type: 'delete' });
    expect(fake.channel().texts('warn')).toContain(EN.t('log.messageRefused', JSON.stringify({ type: 'delete' })));
  });

  it('disposing what it registered removes the commands and the view', () => {
    start().dispose();
    expect(fake.commands.size).toBe(0);
    expect(fake.viewProviders.size).toBe(0);
  });
});

describe('the pages', () => {
  it('with the sidebar view and the editor panel open, both receive the update', async () => {
    start();
    const sidebar = fake.resolveView(VIEW);
    // A window without the container: "Show" opens the editor panel.
    await fake.run('planRelay.show');
    const [editor] = fake.panels;
    expect(editor).toBeDefined();
    fake.run('planRelay.collapseAll');
    fake.run('planRelay.filter');
    await vi.waitFor(() => expect(editor?.webview.types()).toContain('filter'));
    expect(sidebar.webview.types()).toEqual(expect.arrayContaining(['collapseAll', 'filter']));
    expect(editor?.webview.types()).toEqual(expect.arrayContaining(['collapseAll', 'filter']));
  });

  it('a closed page stops receiving; the other one goes on', async () => {
    start();
    const sidebar = fake.resolveView(VIEW);
    await fake.run('planRelay.show');
    const [editor] = fake.panels;
    editor?.dispose();
    fake.run('planRelay.collapseAll');
    await vi.waitFor(() => expect(sidebar.webview.types()).toContain('collapseAll'));
    expect(editor?.webview.types()).not.toContain('collapseAll');
  });

  it('"Show" again brings the open editor panel to the front instead of opening another', async () => {
    start();
    await fake.run('planRelay.show');
    await fake.run('planRelay.show');
    expect(fake.panels).toHaveLength(1);
    expect(fake.panels[0]?.revealed).toBe(1);
    expect(fake.channel().texts()).toContain(EN.t('log.revealedCommand'));
  });

  it('in a window with the container, "Show" reveals it and opens no tab', async () => {
    start({ prepare: () => fake.builtInCommands.push(REVEAL_CONTAINER) });
    await fake.run('planRelay.show');
    expect(fake.executed.map((e) => e.command)).toContain(REVEAL_CONTAINER);
    expect(fake.panels).toEqual([]);
  });

  it('the page gets the HTML with scripts on and only the extension folders as roots', () => {
    start();
    const view = fake.resolveView(VIEW);
    expect(view.webview.html).toContain('<html');
    expect(view.webview.options).toMatchObject({ enableScripts: true });
    expect(String((view.webview.options as { localResourceRoots: Uri[] }).localResourceRoots.map((u) => u.path))).toBe(
      '/ext/dist,/ext/media',
    );
  });

  it('the replies to "ready" go only to the page that asked', async () => {
    start();
    const sidebar = fake.resolveView(VIEW);
    await fake.run('planRelay.show');
    const [editor] = fake.panels;
    editor?.webview.receive({ type: 'ready' });
    await vi.waitFor(() => expect(editor?.webview.types()).toContain('notices'));
    expect(sidebar.webview.types()).not.toContain('notices');
  });

  it('the plans read reach the page, and a page that comes later gets them on "ready"', async () => {
    const ws = workspaceWithPlan();
    start({ prepare: () => fake.openFolders(ws.root) });
    const sidebar = fake.resolveView(VIEW);
    await received(sidebar, 'status');
    const status = sidebar.webview.posted.find((m) => (m as { type: string }).type === 'status') as { plans: { name: string }[] };
    expect(status.plans.map((p) => p.name)).toEqual(['test-plan']);
    expect(fake.channel().texts()).toContain(EN.t('log.plansSent', 1));
    await fake.run('planRelay.show');
    const [editor] = fake.panels;
    editor?.webview.receive({ type: 'ready' });
    await received(editor!, 'status');
  });

  it('"Plugin status…" shows the plugin state and the time of the last read', async () => {
    const ws = workspaceWithPlan();
    start({ prepare: () => fake.openFolders(ws.root) });
    const sidebar = fake.resolveView(VIEW);
    await received(sidebar, 'status');
    fake.run('planRelay.pluginStatus');
    const shown = fake.shown.at(-1);
    expect(shown?.severity).toBe('info');
    expect(shown?.text).toMatch(/\d\d:\d\d/);
  });

  it('"5-hour window gate…" writes the choice to the folder\'s .claude/settings.local.json, never on activation', async () => {
    const ws = workspaceWithPlan();
    start({ prepare: () => fake.openFolders(ws.root) });
    const settings = join(ws.root, '.claude', 'settings.local.json');
    expect(existsSync(settings)).toBe(false);
    fake.pick = (items) => (items as { id: string }[]).find((i) => i.id === 'on');
    fake.run('planRelay.windowGate');
    await vi.waitFor(() => expect(existsSync(settings)).toBe(true));
    expect(JSON.parse(readFileSync(settings, 'utf8'))).toEqual({ env: { PLAN_RELAY_WINDOW: 'on' } });
    await vi.waitFor(() => expect(fake.shown.at(-1)?.severity).toBe('info'));
  });
});

describe('the messages from the page', () => {
  const ROUTES: [object, keyof PanelActions, unknown[]][] = [
    [{ type: 'open', plan: 'p', file: 'MAP.md' }, 'openItem', ['p', 'MAP.md']],
    [{ type: 'delete', plan: 'p' }, 'remove', ['p']],
    [{ type: 'execute', plan: 'p', id: 'F1-01' }, 'execute', ['p', 'F1-01']],
    [{ type: 'giveUp', plan: 'p', id: 'F1-01' }, 'giveUp', ['p', 'F1-01']],
    [{ type: 'reopen', plan: 'p', id: 'F1-01' }, 'reopen', ['p', 'F1-01']],
    [{ type: 'run', plan: 'p' }, 'run', ['p']],
    [{ type: 'copy', plan: 'p', id: 'F1-01' }, 'copy', ['p', 'F1-01']],
    [{ type: 'ideaRefine', idea: 'i.md' }, 'refineIdea', ['i.md']],
    [{ type: 'ideaMap', idea: 'i.md' }, 'createTasksFromIdea', ['i.md']],
    [{ type: 'ideaOpen', idea: 'i.md' }, 'openIdea', ['i.md']],
    [{ type: 'ideaNew' }, 'newIdea', []],
    [{ type: 'ideaFolder' }, 'openIdeasFolder', []],
  ];

  it.each(ROUTES)('%j goes to PanelActions.%s, without canned answers', async (message, method, args) => {
    const action = vi.spyOn(PanelActions.prototype, method).mockResolvedValue(undefined);
    start();
    fake.resolveView(VIEW).webview.receive(message);
    await vi.waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(action.mock.lastCall).toEqual(args);
  });

  it('"install" goes to the agent and asks for the scope', async () => {
    const install = vi.spyOn(AgentWiring.prototype, 'install').mockResolvedValue(undefined);
    start();
    fake.resolveView(VIEW).webview.receive({ type: 'install' });
    await vi.waitFor(() => expect(install).toHaveBeenCalledWith());
  });

  it('"refresh" requests a load from the button', async () => {
    const request = vi.spyOn(Schedule.prototype, 'request');
    start();
    fake.resolveView(VIEW).webview.receive({ type: 'refresh' });
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('button'));
  });

  it('"tab" sets the context key the title bar reads', async () => {
    start();
    fake.resolveView(VIEW).webview.receive({ type: 'tab', tab: 'ideas' });
    await vi.waitFor(() => expect(fake.executed).toContainEqual({ command: 'setContext', args: ['planRelay.tab', 'ideas'] }));
  });

  it('a message outside the contract is refused and logged, and reaches no action', () => {
    const actions = Object.getOwnPropertyNames(PanelActions.prototype)
      .filter((m) => m !== 'constructor' && typeof Object.getOwnPropertyDescriptor(PanelActions.prototype, m)?.value === 'function')
      .map((m) => vi.spyOn(PanelActions.prototype, m as keyof PanelActions));
    start();
    fake.resolveView(VIEW).webview.receive({ type: 'delete' });
    expect(fake.channel().texts('warn')).toContain(EN.t('log.messageRefused', JSON.stringify({ type: 'delete' })));
    for (const a of actions) expect(a).not.toHaveBeenCalled();
  });

  it('an action that fails becomes an error line, not an unhandled rejection', async () => {
    vi.spyOn(PanelActions.prototype, 'run').mockRejectedValue(new Error('boom'));
    start();
    fake.resolveView(VIEW).webview.receive({ type: 'run', plan: 'p' });
    await vi.waitFor(() => expect(fake.channel().texts('error').join('\n')).toContain('boom'));
  });
});

describe('the commands', () => {
  it.each([
    [['project'], ['project']],
    [['user'], ['user']],
    [['local'], [undefined]],
    [[], [undefined]],
  ])('installPlugin %j installs with scope %j', async (args, expected) => {
    const install = vi.spyOn(AgentWiring.prototype, 'install').mockResolvedValue(undefined);
    start();
    await fake.run('planRelay.installPlugin', ...args);
    expect(install.mock.lastCall).toEqual(expected);
  });

  it.each([
    [['local'], ['local']],
    [['global'], [undefined]],
  ])('uninstallPlugin %j uninstalls with scope %j', async (args, expected) => {
    const uninstall = vi.spyOn(AgentWiring.prototype, 'uninstall').mockResolvedValue(undefined);
    start();
    await fake.run('planRelay.uninstallPlugin', ...args);
    expect(uninstall.mock.lastCall).toEqual(expected);
  });

  it('map passes the Uri from the explorer, and nothing else as a target', async () => {
    const map = vi.spyOn(PanelActions.prototype, 'mapIdea').mockResolvedValue(undefined);
    start();
    const uri = Uri.file('/ws/IDEIA.md');
    await fake.run('planRelay.map', uri);
    await fake.run('planRelay.map', '/ws/IDEIA.md');
    expect(map.mock.calls.map((c) => c[0])).toEqual([uri, undefined]);
  });

  it.each([
    ['planRelay.deletePlan', [7], 'remove'],
    ['planRelay.runTask', ['p'], 'execute'],
    ['planRelay.runPlan', [undefined], 'run'],
    ['planRelay.giveUpTask', ['p', 3], 'giveUp'],
    ['planRelay.reopenTask', [undefined, 'F1-01'], 'reopen'],
  ] as const)('%s with arguments of the wrong type does nothing', async (command, args, method) => {
    const action = vi.spyOn(PanelActions.prototype, method);
    start();
    expect(await fake.run(command, ...args)).toBeUndefined();
    expect(action).not.toHaveBeenCalled();
  });

  it('refresh loads even with the page hidden', async () => {
    const request = vi.spyOn(Schedule.prototype, 'request');
    start();
    await fake.run('planRelay.refresh');
    expect(request).toHaveBeenCalledWith('command', { evenHidden: true });
  });

  it('a change of the interval setting reaches the schedule; another setting does not', () => {
    const setInterval = vi.spyOn(Schedule.prototype, 'setInterval');
    start({ prepare: () => fake.settings.set('planRelay.refreshIntervalMinutes', 9) });
    fake.configurationChange.fire({ affectsConfiguration: (s) => s === 'planRelay.notifications' });
    expect(setInterval).not.toHaveBeenCalled();
    fake.configurationChange.fire({ affectsConfiguration: (s) => s === 'planRelay.refreshIntervalMinutes' });
    expect(setInterval).toHaveBeenCalledWith(9);
    expect(fake.channel().texts()).toContain(EN.t('log.interval', 9));
  });
});

describe('the watchers', () => {
  it('one per glob and per folder, the plans and the agent settings', () => {
    start({ prepare: () => fake.openFolders('/a', '/b') });
    const patterns = fake.watchers.map((w) => w.pattern.pattern);
    expect(patterns.filter((p) => WATCHED_GLOBS.includes(p))).toHaveLength(WATCHED_GLOBS.length * 2);
    expect(patterns).toContain('.claude/settings.json');
    expect(fake.channel().texts()).toContain(EN.t('log.watchers', fake.watchers.length, 2));
  });

  it('a plan file that changes requests a load', () => {
    const request = vi.spyOn(Schedule.prototype, 'request');
    start({ prepare: () => fake.openFolders('/a') });
    const plans = fake.watchers.find((w) => w.pattern.pattern === WATCHED_GLOBS[0]);
    plans?.changed.fire(Uri.file('/a/agent_plans/p/phase-1-x/F1-01-a.md'));
    expect(request).toHaveBeenLastCalledWith('file');
  });

  it('a change of folders rebuilds them and drops the old ones', () => {
    start({ prepare: () => fake.openFolders('/a') });
    const before = [...fake.watchers];
    fake.openFolders('/a', '/b');
    fake.folderChange.fire({});
    expect(before.every((w) => w.disposed)).toBe(true);
    expect(fake.watchers.filter((w) => !w.disposed)).toHaveLength(before.length * 2);
  });
});

describe('the first run', () => {
  it('in a workspace with a plan, reveals the panel once and remembers it', async () => {
    const ws = workspaceWithPlan();
    const { context } = start({
      prepare: () => {
        fake.openFolders(ws.root);
        fake.builtInCommands.push(REVEAL_CONTAINER);
      },
    });
    await vi.waitFor(() => expect(context.workspaceState.get(REVEALED_KEY)).toBe(true));
    expect(fake.executed.map((e) => e.command)).toContain(REVEAL_CONTAINER);
    expect(fake.channel().texts()).toContain(EN.t('log.revealedFirstTime'));
  });

  it('without a plan, does not reveal', async () => {
    const { context } = start({ prepare: () => fake.builtInCommands.push(REVEAL_CONTAINER) });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(context.workspaceState.get(REVEALED_KEY)).toBeUndefined();
    expect(fake.executed.map((e) => e.command)).not.toContain(REVEAL_CONTAINER);
  });
});

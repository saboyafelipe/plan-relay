import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stringsFor } from '@plan-relay/i18n';
import { createPlan, temporaryFolder } from '@plan-relay/reader/testing';
import { AgentWiring } from '../agent';
import type { Provider } from '../agents/provider';
import { load, type LoadedPlan } from '../plans/load';
import { ACTIVE, fakeProvider } from '../testing/provider';
import { FakeChannel, Uri, fake } from '../testing/vscode';
import { PanelActions } from './panel';
import type { IdeaTarget } from './ideas';

const EN = stringsFor('en');

let tmp: ReturnType<typeof temporaryFolder>;
let planFolder: string;
let plans: LoadedPlan[];

interface Built {
  actions: PanelActions;
  channel: FakeChannel;
  provider: Provider;
  requestLoad: ReturnType<typeof vi.fn>;
  reveal: ReturnType<typeof vi.fn>;
  confirmInTab: ReturnType<typeof vi.fn>;
}

function build(options: { ideas?: IdeaTarget[]; provider?: Provider } = {}): Built {
  const channel = new FakeChannel('test');
  const provider = options.provider ?? fakeProvider({ installState: vi.fn(() => Promise.resolve(ACTIVE)) });
  const agent = new AgentWiring(provider, channel, () => undefined, EN);
  const requestLoad = vi.fn();
  const reveal = vi.fn(() => Promise.resolve());
  const confirmInTab = vi.fn(() => Promise.resolve(undefined));
  const actions = new PanelActions(
    agent,
    { plans: () => plans, ideas: () => options.ideas ?? [], requestLoad, reveal, confirmInTab },
    channel,
    EN,
  );
  return { actions, channel, provider, requestLoad, reveal, confirmInTab };
}

function idea(status: IdeaTarget['status'] = 'open'): IdeaTarget {
  return {
    folder: tmp.folder,
    file: join(tmp.folder, 'agent_plans', '_ideas', 'export.md'),
    slug: 'export',
    title: 'Export',
    status,
    openQuestions: 0,
  };
}

function statusOf(file: string): string | undefined {
  return /^Status: (.+)$/m.exec(readFileSync(join(planFolder, file), 'utf8'))?.[1];
}

beforeEach(async () => {
  fake.reset();
  tmp = temporaryFolder();
  planFolder = createPlan(tmp.folder);
  fake.openFolders(tmp.folder);
  plans = await load([tmp.folder]);
});
afterEach(() => tmp.remove());

describe('a target that is not from the last read', () => {
  it.each([
    ['execute', (a: PanelActions) => a.execute('/elsewhere', 'F1-01')],
    ['run', (a: PanelActions) => a.run('/elsewhere')],
    ['copy', (a: PanelActions) => a.copy('/elsewhere')],
    ['remove', (a: PanelActions) => a.remove('/elsewhere')],
    ['giveUp', (a: PanelActions) => a.giveUp('/elsewhere', 'F1-01')],
    ['reopen', (a: PanelActions) => a.reopen('/elsewhere', 'F1-01')],
    ['openItem', (a: PanelActions) => a.openItem('/elsewhere', 'MAP.md')],
    ['refineIdea', (a: PanelActions) => a.refineIdea('/elsewhere.md')],
    ['createTasksFromIdea', (a: PanelActions) => a.createTasksFromIdea('/elsewhere.md')],
    ['openIdea', (a: PanelActions) => a.openIdea('/elsewhere.md')],
  ])('%s: a warning line, and nothing opens nor is asked', async (_name, act) => {
    const { actions, channel } = build();
    await act(actions);
    expect(channel.texts('warn')).toHaveLength(1);
    expect(fake.shown).toEqual([]);
    expect(fake.clipboard).toBe('');
    expect(fake.documents).toEqual([]);
  });
});

describe('the actions on a plan', () => {
  it('"Run" on a free task opens the agent with the plan skill (copied, for a provider that cannot open)', async () => {
    const { actions, channel } = build();
    await actions.execute(planFolder, 'F1-01');
    expect(JSON.parse(fake.clipboard)).toEqual({ plan: 'test-plan', id: 'F1-01' });
    expect(channel.texts().at(-1)).toMatch(/test-plan F1-01/);
  });

  it('a task without a button is refused with a line', async () => {
    const { actions, channel } = build();
    await actions.execute(planFolder, 'F0-01');
    expect(fake.clipboard).toBe('');
    expect(channel.texts('warn')).toHaveLength(1);
  });

  it('with the plugin missing and the offer closed, nothing opens', async () => {
    const { actions, channel } = build({ provider: fakeProvider() });
    await actions.execute(planFolder, 'F1-01');
    expect(fake.clipboard).toBe('');
    expect(fake.shown[0]).toMatchObject({ options: { modal: true, detail: EN.t('notice.pluginToRun', 'Agent') } });
    expect(channel.texts()).toContain(EN.t('log.stoppedPlugin', `${EN.t('channel.execute')}: test-plan F1-01 (available)`));
  });

  it('"Run plan" with a run open asks first; closing the modal stops', async () => {
    const { actions } = build();
    await actions.run(planFolder);
    expect(fake.shown[0]).toMatchObject({ severity: 'warning', options: { modal: true } });
    expect(fake.clipboard).toBe('');
  });

  it('"Run plan" with the canned "run" answer goes on without the modal', async () => {
    const { actions, channel } = build();
    await actions.run(planFolder, { answer: 'run' });
    expect(fake.shown.filter((s) => s.options !== undefined)).toEqual([]);
    expect(JSON.parse(fake.clipboard)).toEqual({ run: 'test-plan' });
    expect(channel.texts()).toContain(EN.t('log.answer', EN.t('channel.run'), 'run'));
  });

  it('a canned answer outside the options counts as "Cancel" and is logged', async () => {
    const { actions, channel } = build();
    await actions.run(planFolder, { answer: 'delete' });
    expect(fake.clipboard).toBe('');
    expect(channel.texts('warn')).toContain(EN.t('log.modalOutsideOptions', 'run', 'delete'));
  });

  it('choosing the modal button goes on', async () => {
    fake.answer = (s) => s.items[0];
    const { actions } = build();
    await actions.run(planFolder);
    expect(JSON.parse(fake.clipboard)).toEqual({ run: 'test-plan' });
  });

  it('"Copy" copies the provider command and says so', async () => {
    const { actions } = build();
    await actions.copy(planFolder, 'F1-02');
    expect(JSON.parse(fake.clipboard)).toEqual({ plan: 'test-plan', id: 'F1-02' });
    expect(fake.shown.at(-1)?.text).toBe(EN.t('notice.brand', EN.t('notice.commandCopied')));
  });

  it('a plan in a folder other than the first warns that the agent opens in the first', async () => {
    fake.openFolders('/first', tmp.folder);
    const { actions, channel } = build();
    await actions.execute(planFolder, 'F1-01');
    expect(channel.texts('warn')).toContain(EN.t('log.agentOtherFolder', tmp.folder));
    expect(fake.shown.some((s) => s.severity === 'warning')).toBe(true);
  });

  it('"Open" opens a file of the plan, and refuses one outside it', async () => {
    writeFileSync(join(planFolder, 'MAP.md'), '# map\n');
    const { actions, channel } = build();
    await actions.openItem(planFolder, 'MAP.md');
    expect(fake.documents.map((d) => d.fsPath)).toEqual([join(planFolder, 'MAP.md')]);
    await actions.openItem(planFolder, '../../outside.md');
    expect(fake.documents).toHaveLength(1);
    expect(channel.texts('warn')).toContain(EN.t('log.openRefused', '../../outside.md', 'test-plan'));
  });

  it('an editor that fails to open becomes a warning notice', async () => {
    const { window } = await import('../testing/vscode');
    const spy = vi.spyOn(window, 'showTextDocument').mockRejectedValue(new Error('locked'));
    const { actions } = build();
    await actions.openItem(planFolder, 'MAP.md');
    expect(fake.shown.at(-1)).toMatchObject({
      severity: 'warning',
      text: EN.t('notice.brand', EN.t('notice.couldNotOpen', 'MAP.md', 'test-plan')),
    });
    spy.mockRestore();
  });
});

describe('deleting', () => {
  it('reads the state under a progress notification, asks, and closing keeps the plan', async () => {
    const { actions, requestLoad } = build();
    await actions.remove(planFolder);
    expect(fake.progress).toContain(EN.t('notice.brand', EN.t('notice.readingStatus')));
    expect(fake.shown[0]).toMatchObject({ severity: 'warning', options: { modal: true } });
    expect(requestLoad).not.toHaveBeenCalled();
    expect(statusOf('phase-1-rest/F1-01-free.md')).toBe('ready');
  });

  it('with "delete" chosen, the plan goes and a reload is requested', async () => {
    fake.answer = (s) => s.items[0];
    const { actions, requestLoad } = build();
    await actions.remove(planFolder);
    expect(() => readFileSync(join(planFolder, 'plan.json'))).toThrow();
    expect(requestLoad).toHaveBeenCalled();
  });
});

describe('giving up and reopening', () => {
  it('with the canned answers, gives up with the reason and reopens, writing the task file', async () => {
    const { actions, requestLoad } = build();
    await actions.giveUp(planFolder, 'F1-01', { answer: 'give-up', reason: 'Sem máquina Windows' });
    expect(statusOf('phase-1-rest/F1-01-free.md')).toBe('abandoned');
    expect(requestLoad).toHaveBeenCalled();
    await actions.reopen(planFolder, 'F1-01', { answer: 'reopen' });
    expect(statusOf('phase-1-rest/F1-01-free.md')).toBe('ready');
  });

  it('without answers, the give-up goes to the confirmation tab, and "Go back" changes nothing', async () => {
    const { actions, confirmInTab } = build();
    await actions.giveUp(planFolder, 'F1-01');
    expect(confirmInTab).toHaveBeenCalledOnce();
    expect(statusOf('phase-1-rest/F1-01-free.md')).toBe('ready');
  });

  it('reopen asks in a modal whose button applies', async () => {
    const { actions } = build();
    await actions.giveUp(planFolder, 'F1-01', { answer: 'give-up', reason: 'Sem máquina Windows' });
    fake.answer = (s) => s.items[0];
    await actions.reopen(planFolder, 'F1-01');
    expect(statusOf('phase-1-rest/F1-01-free.md')).toBe('ready');
  });

  it('a task file with unsaved edits stops the give-up', async () => {
    fake.textDocuments = [{ uri: Uri.file(join(planFolder, 'phase-1-rest', 'F1-01-free.md')), isDirty: true }];
    const { actions } = build();
    await actions.giveUp(planFolder, 'F1-01', { answer: 'give-up', reason: 'Sem máquina Windows' });
    expect(statusOf('phase-1-rest/F1-01-free.md')).toBe('ready');
    expect(fake.shown).toEqual([
      expect.objectContaining({ severity: 'warning', text: EN.t('notice.brand', EN.t('edit.notSaved', 'F1-01')) }),
    ]);
  });
});

describe('the ideas', () => {
  it('"Refine" and "Create tasks" open the agent with the idea', async () => {
    const { actions } = build({ ideas: [idea()] });
    await actions.refineIdea(idea().file);
    expect(JSON.parse(fake.clipboard)).toEqual({ refine: 'agent_plans/_ideas/export.md' });
    await actions.createTasksFromIdea(idea().file);
    expect(JSON.parse(fake.clipboard)).toEqual({ map: 'agent_plans/_ideas/export.md' });
  });

  it('"Open" opens the idea file', async () => {
    mkdirSync(join(tmp.folder, 'agent_plans', '_ideas'));
    writeFileSync(idea().file, 'Status: open\n\n# Export\n');
    const { actions } = build({ ideas: [idea()] });
    await actions.openIdea(idea().file);
    expect(fake.documents.map((d) => d.fsPath)).toEqual([idea().file]);
  });

  it('"New idea" opens the agent with the idea skill; without a folder it only logs', async () => {
    const { actions, channel } = build();
    await actions.newIdea();
    expect(JSON.parse(fake.clipboard)).toEqual({ idea: true });
    fake.workspaceFolders = undefined;
    fake.clipboard = '';
    await actions.newIdea();
    expect(fake.clipboard).toBe('');
    expect(channel.texts('warn')).toContain(EN.t('log.noWorkspaceFolder', 'ideaNew'));
  });

  it('"Open folder" reveals the ideas folder; without it, says that "New idea" creates it', async () => {
    const { actions } = build();
    await actions.openIdeasFolder();
    expect(fake.shown.at(-1)?.text).toBe(EN.t('notice.brand', EN.t('notice.noIdeasFolder', 'agent_plans/_ideas/')));
    mkdirSync(join(tmp.folder, 'agent_plans', '_ideas'));
    await actions.openIdeasFolder();
    expect(fake.executed.at(-1)).toMatchObject({ command: 'revealInExplorer' });
    fake.workspaceFolders = undefined;
    const { actions: without, channel } = build();
    await without.openIdeasFolder();
    expect(channel.texts('warn')).toContain(EN.t('log.noWorkspaceFolder', 'ideaFolder'));
  });
});

describe('"Create tasks from this plan"', () => {
  it('without a target nor a Markdown editor, says to open the .md', async () => {
    const { actions, channel } = build();
    await actions.mapIdea(undefined);
    expect(channel.texts()).toContain(EN.t('log.mapNoMd'));
    expect(fake.shown[0]?.text).toBe(EN.t('notice.brand', EN.t('notice.openTheMd')));
  });

  it('takes the active Markdown editor and opens the agent with the map skill', async () => {
    const md = join(tmp.folder, 'IDEIA.md');
    writeFileSync(md, '# Ideia\n');
    fake.activeTextEditor = { document: { uri: Uri.file(md) } };
    const { actions } = build();
    await actions.mapIdea(undefined);
    expect(JSON.parse(fake.clipboard)).toEqual({ map: 'IDEIA.md' });
  });
});

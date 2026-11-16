// The actions of the panel and the commands — "Create tasks from this plan", "Delete", "Run"/"Resume", "Run plan" and
// opening a plan file — with the real dependencies (`vscode`, the agent provider). Extracted from the `PanelView` class
// in extension.ts; the pure flows live in `execute.ts` and `flow.ts`.
import * as vscode from 'vscode';
import { stringsFor, type Strings } from '@plan-relay/i18n';
import { errorText, type ConfirmationData } from '@plan-relay/panel';
import { basename, dirname, join } from 'node:path';
import { openInPlan } from '../open';
import { openWithPrompt, otherFolderNotice } from '../agents/provider';
import type { AgentWiring } from '../agent';
import { inChannel } from '../channel';
import { errorMessage } from '../util';
import type { CannedAnswers } from '../canned-answers';
import type { LoadedPlan } from '../plans/load';
import { discoverPlans, readPlanStatus } from '../plans/status';
import { nodeFiles } from '@plan-relay/reader/node';
import { typeEnabled } from '../notify/alert';
import { deletePlan, vscodeFs } from './delete';
import { giveUpTask, writeAll, readPlanToEdit, reopenTask, type Confirmation, type EditDeps } from './give-up';
import { takeLocks } from './task-lock';
import { actionTarget, run, copyCommand, execute, type ActionDeps } from './execute';
import { ideaTarget, createTasksFromIdea, newIdea, ideasFolder, startRefine, type IdeaTarget } from './ideas';
import { deleteFromCard, mapIdea, type FlowDeps } from './flow';
import { givenOption, askForOption, optionLabels } from './modal';

type Channel = { info(text: string): void; warn(text: string): void };

/** The workspace folders, in order: the agent session opens in the first. */
export function workspaceFolders(): string[] {
  return (vscode.workspace.workspaceFolders ?? []).map((p) => p.uri.fsPath);
}

export interface ActionsWiring {
  /** The plans from the last read; only they are acted on. */
  plans(): readonly LoadedPlan[];
  /** The ideas from the last read; only they are acted on. */
  ideas(): readonly IdeaTarget[];
  /** Requests a refresh of the plans (after deleting). */
  requestLoad(): void;
  /** Reveals the panel. */
  reveal(): Promise<void>;
  /** The give-up confirmation in a tab: the "Abandon" reason, or `undefined` to go back. */
  confirmInTab(data: ConfirmationData): Promise<string | undefined>;
}

export class PanelActions {
  constructor(
    private readonly agent: AgentWiring,
    private readonly wiring: ActionsWiring,
    private readonly channel: Channel,
    private readonly strings: Strings = stringsFor(),
  ) {}

  /** "Run"/"Resume" on a task: the plan and the task must come from the last read, in a group with a button. */
  async execute(planId: string, id: string, answers?: CannedAnswers): Promise<void> {
    const target = actionTarget(this.wiring.plans(), planId, id, this.strings);
    if ('error' in target) {
      this.channel.warn(target.error);
      return;
    }
    if (target.task) await execute(target.plan, target.task, this.actionDeps(answers));
  }

  /** "Run plan" on the plan from the last read. */
  async run(planId: string, answers?: CannedAnswers): Promise<void> {
    const target = actionTarget(this.wiring.plans(), planId, undefined, this.strings);
    if ('error' in target) {
      this.channel.warn(target.error);
      return;
    }
    const currentRun = 'status' in target.plan ? target.plan.status.run : null;
    await run(target.plan, currentRun, this.actionDeps(answers));
  }

  /** "Copy run command" (or the task's, with `id`) of a plan from the last read: the text is the agent provider's. */
  async copy(planId: string, id?: string): Promise<void> {
    const target = actionTarget(this.wiring.plans(), planId, id, this.strings);
    if ('error' in target) {
      this.channel.warn(target.error);
      return;
    }
    await copyCommand(target.plan, id, {
      prompt: (action) => this.agent.provider.prompt(action),
      copy: (text) => vscode.env.clipboard.writeText(text),
      alert: (text) => void vscode.window.showInformationMessage(this.t('notice.brand', text)),
      channel: this.channel,
      strings: this.strings,
    });
  }

  /** "Refine" on an idea from the last read. */
  async refineIdea(id: string, answers?: CannedAnswers): Promise<void> {
    const target = ideaTarget(this.wiring.ideas(), id, 'refine', this.strings);
    if ('error' in target) {
      this.channel.warn(target.error);
      return;
    }
    await startRefine(target.idea, this.actionDeps(answers));
  }

  /** "Create tasks" on an idea from the last read; with open questions, the modal warns and lets the user proceed. */
  async createTasksFromIdea(id: string, answers?: CannedAnswers): Promise<void> {
    const target = ideaTarget(this.wiring.ideas(), id, 'map', this.strings);
    if ('error' in target) {
      this.channel.warn(target.error);
      return;
    }
    await createTasksFromIdea(target.idea, this.actionDeps(answers));
  }

  /** "Open" on an idea from the last read: opens its file. */
  async openIdea(id: string): Promise<void> {
    const target = ideaTarget(this.wiring.ideas(), id, 'open', this.strings);
    if ('error' in target) {
      this.channel.warn(target.error);
      return;
    }
    await this.openFile(dirname(target.idea.file), target.idea.slug, basename(target.idea.file));
  }

  /** "New idea" on the ideas card: the agent opens with the idea skill in the ideas folder. */
  async newIdea(answers?: CannedAnswers): Promise<void> {
    const folder = ideasFolder(this.wiring.ideas(), workspaceFolders());
    if (folder === undefined) {
      this.channel.warn(this.t('log.noWorkspaceFolder', 'ideaNew'));
      return;
    }
    await newIdea(folder, this.actionDeps(answers));
  }

  /** "Open folder" on the ideas card: reveals `agent_plans/_ideas/` in the Explorer; without it, says that "New idea" creates it. */
  async openIdeasFolder(): Promise<void> {
    const folder = ideasFolder(this.wiring.ideas(), workspaceFolders());
    if (folder === undefined) {
      this.channel.warn(this.t('log.noWorkspaceFolder', 'ideaFolder'));
      return;
    }
    const uri = vscode.Uri.file(join(folder, 'agent_plans', '_ideas'));
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      const notice = this.t('notice.noIdeasFolder', 'agent_plans/_ideas/');
      this.channel.info(`ideaFolder: ${notice}`);
      void vscode.window.showInformationMessage(this.t('notice.brand', notice));
      return;
    }
    this.channel.info(`ideaFolder → ${uri.fsPath}`);
    await vscode.commands.executeCommand('revealInExplorer', uri);
  }

  /** "Create tasks from this plan" for the given `.md`, or the active editor's. */
  async mapIdea(uri: vscode.Uri | undefined, answers?: CannedAnswers): Promise<void> {
    const editor = vscode.window.activeTextEditor?.document.uri;
    const target = uri ?? (editor?.scheme === 'file' && /\.md$/i.test(editor.fsPath) ? editor : undefined);
    if (!target) {
      this.channel.info(this.t('log.mapNoMd'));
      void vscode.window.showInformationMessage(this.t('notice.brand', this.t('notice.openTheMd')));
      return;
    }
    this.channel.info(`${inChannel('map', this.strings)}: ${target.fsPath}`);
    await mapIdea(target.fsPath, this.flowDeps(answers));
  }

  /** "Delete" on the card: the plan must come from the last read. */
  async remove(id: string, answers?: CannedAnswers): Promise<void> {
    const plan = this.wiring.plans().find((p) => p.folder === id);
    if (!plan) {
      this.channel.warn(this.t('log.unknownPlan', inChannel('delete', this.strings), id));
      return;
    }
    await deleteFromCard(plan, this.flowDeps(answers));
  }

  /** "Give up" on a task: the plan must come from the last read; the flow re-reads the plan before anything else. */
  async giveUp(planId: string, id: string, answers?: CannedAnswers): Promise<void> {
    const plan = this.wiring.plans().find((p) => p.folder === planId);
    if (!plan) {
      this.channel.warn(this.t('log.unknownPlan', inChannel('giveUp', this.strings), planId));
      return;
    }
    const finished = await giveUpTask(id, this.editDeps(plan.folder, 'give-up', answers));
    this.channel.info(this.t('log.answer', `${inChannel('giveUp', this.strings)} ${id}`, inChannel(finished, this.strings)));
  }

  /** "Reopen" on the root of a give-up. */
  async reopen(planId: string, id: string, answers?: CannedAnswers): Promise<void> {
    const plan = this.wiring.plans().find((p) => p.folder === planId);
    if (!plan) {
      this.channel.warn(this.t('log.unknownPlan', inChannel('reopen', this.strings), planId));
      return;
    }
    const finished = await reopenTask(id, this.editDeps(plan.folder, 'reopen', answers));
    this.channel.info(this.t('log.answer', `${inChannel('reopen', this.strings)} ${id}`, inChannel(finished, this.strings)));
  }

  /** Opens a plan file from the last read: only files of plans the extension itself read are opened. */
  async openItem(id: string, file: string): Promise<void> {
    const plan = this.wiring.plans().find((p) => p.folder === id);
    if (!plan) {
      this.channel.warn(this.t('log.unknownPlan', inChannel('open', this.strings), id));
      return;
    }
    await this.openFile(plan.folder, plan.name, file);
  }

  private async openFile(folder: string, name: string, file: string): Promise<void> {
    try {
      if (!(await openInPlan(vscode.window, vscode.Uri, folder, file))) {
        this.channel.warn(this.t('log.openRefused', file, name));
      }
    } catch (error) {
      this.channel.warn(`${inChannel('open', this.strings)}: ${file} (${name}): ${errorMessage(error)}`);
      void vscode.window.showWarningMessage(this.t('notice.brand', this.t('notice.couldNotOpen', file, name)));
    }
  }

  /** Opens the agent with the prompt through the provider (or copies it), warning when the plan is in another folder. */
  private openAgent(prompt: string, folder: string): Promise<string> {
    const provider = this.agent.provider;
    const notice = otherFolderNotice(provider.name, folder, workspaceFolders(), this.strings);
    if (notice) {
      this.channel.warn(this.t('log.agentOtherFolder', folder));
      void vscode.window.showWarningMessage(this.t('notice.brand', notice));
    }
    return openWithPrompt(provider, prompt, {
      copy: (text) => vscode.env.clipboard.writeText(text),
      alert: (text) => vscode.window.showInformationMessage(this.t('notice.brand', text)),
      channel: this.channel,
      strings: this.strings,
    });
  }

  private get t(): Strings['t'] {
    return this.strings.t;
  }

  /**
   * The modal shows the labels and returns the identifier of the button. The given answer (`CannedAnswers.answer`) is
   * already an identifier and passes straight through; one that is not among the offered options counts as "Cancel".
   */
  private ask(answers: CannedAnswers | undefined): FlowDeps['ask'] {
    return async (notice, options) => {
      if (answers && answers.answer !== undefined) {
        const given = answers.answer === null ? undefined : givenOption(answers.answer, options);
        this.channel.info(this.t('log.modalAnswerGiven', notice.text, notice.detail, given ?? this.t('log.cancel')));
        if (answers.answer !== null && given === undefined) {
          this.channel.warn(this.t('log.modalOutsideOptions', options.join('|'), answers.answer));
        }
        return given;
      }
      return askForOption(
        (labels) => vscode.window.showWarningMessage(notice.text, { modal: true, detail: notice.detail }, ...labels),
        options,
        optionLabels(this.strings),
      );
    };
  }

  /**
   * The "Reopen" modal: the button that applies and "Cancel", which is the close (Esc). The given answer
   * (`CannedAnswers.answer`) confirms only when it is the verb identifier (`give-up`, `reopen`).
   */
  private confirm(verb: 'give-up' | 'reopen', answers: CannedAnswers | undefined): (c: Confirmation) => Promise<boolean> {
    return async (c) => {
      if (answers && answers.answer !== undefined) {
        this.channel.info(this.t('log.modalAnswerGiven', c.text, c.detail, answers.answer ?? this.t('log.cancel')));
        return answers.answer === verb;
      }
      const apply: vscode.MessageItem = { title: c.button };
      const chosen = await vscode.window.showWarningMessage(c.text, { modal: true, detail: c.detail }, apply);
      return chosen === apply;
    };
  }

  private editDeps(folder: string, verb: 'give-up' | 'reopen', answers: CannedAnswers | undefined): EditDeps {
    return {
      folder,
      read: () => readPlanToEdit(nodeFiles, folder, this.strings),
      confirm: this.confirm(verb, answers),
      confirmGiveUp: async (data) => {
        if (answers && answers.answer !== undefined) {
          this.channel.info(
            this.t(
              'log.modalAnswerGiven',
              data.preview.root,
              data.preview.falls.map((q) => q.id).join(', '),
              answers.answer ?? this.t('log.cancel'),
            ),
          );
          return answers.answer === verb ? (answers.reason ?? undefined) : undefined;
        }
        return this.wiring.confirmInTab(data);
      },
      dirty: (files) =>
        files.filter((a) =>
          vscode.workspace.textDocuments.some((d) => d.isDirty && d.uri.scheme === 'file' && d.uri.fsPath === join(folder, a)),
        ),
      lock: (ids) => takeLocks(folder, ids),
      writeFiles: (files, before, stillOwned) => writeAll(folder, files, undefined, before, stillOwned),
      requestLoad: () => this.wiring.requestLoad(),
      alert: (text) => void vscode.window.showWarningMessage(text),
      inform: (text) => void vscode.window.showInformationMessage(text),
      // Read on the spot, like the notifications: changing the setting takes effect on the next give-up.
      notifiesGiveUp: () => typeEnabled('taskAbandoned', vscode.workspace.getConfiguration('planRelay.notifications')),
      channel: this.channel,
      strings: this.strings,
    };
  }

  private actionDeps(answers: CannedAnswers | undefined): ActionDeps {
    const name = this.agent.provider.name;
    return {
      prompt: (action) => this.agent.provider.prompt(action),
      plugin: () => this.agent.ensure(answers, this.t('notice.pluginToRun', name)),
      ask: this.ask(answers),
      openAgent: (prompt, folder) => this.openAgent(prompt, folder),
      channel: this.channel,
      strings: this.strings,
    };
  }

  private flowDeps(answers: CannedAnswers | undefined): FlowDeps {
    const name = this.agent.provider.name;
    return {
      folders: workspaceFolders,
      discoverAll: async (folders) =>
        (await discoverPlans(folders)).map((p) => ({
          workspaceFolder: p.workspaceFolder,
          name: p.name,
          folder: p.folder,
          origin: 'plan' in p ? p.plan.source : null,
        })),
      // Read now, not from the last refresh: the notice decides whether running work is deleted.
      work: (folder) =>
        Promise.resolve(
          vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: this.t('notice.brand', this.t('notice.readingStatus')) },
            async () => {
              const r = await readPlanStatus(folder);
              if ('error' in r) {
                this.channel.warn(this.t('log.stateFailed', folder, errorText(r.error, this.strings)));
                return undefined;
              }
              return { running: r.progress.in_progress, runOpen: r.run?.open ?? false };
            },
          ),
        ),
      ask: this.ask(answers),
      pluginActive: () => this.agent.ensure(answers, this.t('notice.pluginToMap', name)),
      remove: (root, folder) => deletePlan(root, folder, vscodeFs(vscode), this.strings),
      openExisting: async (plan) => {
        await this.openFile(plan.folder, plan.name, 'MAP.md');
        await this.wiring.reveal();
      },
      prompt: (action) => this.agent.provider.prompt(action),
      openAgent: (prompt, folder) => this.openAgent(prompt, folder),
      requestLoad: () => this.wiring.requestLoad(),
      alert: (text) => void vscode.window.showWarningMessage(text),
      error: (text) => void vscode.window.showErrorMessage(text),
      channel: this.channel,
      strings: this.strings,
    };
  }
}

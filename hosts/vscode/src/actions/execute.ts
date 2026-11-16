// "Run"/"Resume" on a task and "Run plan" on the plan. Target validation is pure; the flows receive their
// dependencies (plugin, provider prompt, modal, open the agent) from outside so they can be tested without `vscode`.
import { stringsFor, type Strings } from '@plan-relay/i18n';
import { errorText } from '@plan-relay/panel';
import type { AgentAction } from '../agents/provider';
import { inChannel } from '../channel';
import type { LoadedPlan } from '../plans/load';
import type { Run, Group, TaskStatus } from '../plans/contract';
import type { PlanNotice } from './map';
import type { ModalOption } from './modal';

/** The groups whose tasks have a button in the panel: "Run" (available, owner) or "Resume" (in progress). */
const WITH_BUTTON: ReadonlySet<Group> = new Set(['available', 'owner', 'in-progress']);

export type ActionTarget = { plan: LoadedPlan; task?: TaskStatus } | { error: string };

/**
 * The target of an `execute` message (with `id`) or `run` message (without `id`): the plan must come from the
 * last read and, to run, the task must be in a group with a button. `error` is the line for the output channel.
 */
export function actionTarget(plans: readonly LoadedPlan[], planId: string, id?: string, strings: Strings = stringsFor()): ActionTarget {
  const { t } = strings;
  const action = inChannel(id === undefined ? 'run' : 'execute', strings);
  const plan = plans.find((p) => p.folder === planId);
  if (!plan) return { error: t('log.unknownPlan', action, planId) };
  if (id === undefined) return { plan };
  if ('error' in plan) return { error: t('log.executeNoState', plan.name, errorText(plan.error, strings)) };
  const task = plan.status.tasks.find((t) => t.id === id);
  if (!task) return { error: t('log.executeUnknownTask', id, plan.name) };
  if (!WITH_BUTTON.has(task.group)) return { error: t('log.executeNoButton', id, plan.name, task.group) };
  return { plan, task };
}

type TargetPlan = Pick<LoadedPlan, 'workspaceFolder' | 'name'>;

export interface ActionDeps {
  /** The action prompt, built by the agent provider. */
  prompt(action: AgentAction): string;
  /** The plugin is active, or was just installed; `false` stops. The `plan` and `run` skills belong to the plugin. */
  plugin(): Promise<boolean>;
  /** Modal with the given options (identifiers); returns the chosen identifier, and "Cancel" gives `undefined`. */
  ask(notice: PlanNotice, options: readonly ModalOption[]): Promise<ModalOption | undefined>;
  /** Opens the agent with the prompt (or copies it). `workspaceFolder`: the workspace folder the plan comes from. */
  openAgent(prompt: string, workspaceFolder: string): Promise<string>;
  channel: { info(text: string): void; warn(text: string): void };
  /** The language of notices and the output channel (English without it). */
  strings?: Strings;
}

/** "Run" (available, owner) and "Resume" (in progress): the plugin `plan` skill with the plan folder and the ID. */
export async function execute(plan: TargetPlan, task: Pick<TaskStatus, 'id' | 'group'>, deps: ActionDeps): Promise<'opened' | 'no-plugin'> {
  const strings = deps.strings ?? stringsFor();
  const { t } = strings;
  const action = inChannel(task.group === 'in-progress' ? 'resume' : 'execute', strings);
  const line = `${action}: ${plan.name} ${task.id} (${task.group})`;
  if (!(await deps.plugin())) {
    deps.channel.info(t('log.stoppedPlugin', line));
    return 'no-plugin';
  }
  const path = await deps.openAgent(deps.prompt({ plan: plan.name, id: task.id }), plan.workspaceFolder);
  deps.channel.info(`${line} → ${inChannel(path, strings)}`);
  return 'opened';
}

export interface CopyDeps {
  /** The action prompt, built by the agent provider: the command text is the provider's, not the page's. */
  prompt(action: AgentAction): string;
  copy(text: string): PromiseLike<void>;
  alert(text: string): void;
  channel: { info(text: string): void };
  strings?: Strings;
}

/** "Copy run command" (without `id`) or the task's (with `id`): copies the provider prompt and notifies. Returns the copied text. */
export async function copyCommand(plan: Pick<TargetPlan, 'name'>, id: string | undefined, deps: CopyDeps): Promise<string> {
  const { t } = deps.strings ?? stringsFor();
  const text = deps.prompt(id === undefined ? { run: plan.name } : { plan: plan.name, id });
  await deps.copy(text);
  deps.channel.info(t('log.commandCopied', plan.name, text));
  deps.alert(t('notice.commandCopied'));
  return text;
}

/** "Run plan": plugin required; with an autopilot run open, confirms first. */
export async function run(plan: TargetPlan, currentRun: Run | null, deps: ActionDeps): Promise<'opened' | 'no-plugin' | 'cancelled'> {
  const strings = deps.strings ?? stringsFor();
  const { t } = strings;
  const runInChannel = inChannel('run', strings);
  if (!(await deps.plugin())) {
    deps.channel.info(t('log.stoppedPlugin', `${runInChannel}: ${plan.name}`));
    return 'no-plugin';
  }
  if (currentRun?.open) {
    const notice: PlanNotice = {
      strong: true,
      text: t('notice.runOpenResume', currentRun.log),
      detail: t('notice.runOpenDispute'),
    };
    deps.channel.info(t('log.conductRunOpen', plan.name, currentRun.log));
    const answer = await deps.ask(notice, ['run']);
    deps.channel.info(t('log.answer', runInChannel, answer ?? t('log.cancel')));
    if (answer !== 'run') return 'cancelled';
  }
  const path = await deps.openAgent(deps.prompt({ run: plan.name }), plan.workspaceFolder);
  deps.channel.info(`${runInChannel}: ${plan.name} → ${inChannel(path, strings)}`);
  return 'opened';
}

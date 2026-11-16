// The path of "Create tasks from this plan" and "Delete" on the card, with injected dependencies:
// the questions, the plugin, the delete and the agent come from outside, so the flow can be tested without `vscode`.
import { stringsFor, type Strings } from '@plan-relay/i18n';
import type { AgentAction } from '../agents/provider';
import { inChannel } from '../channel';
import { mapTarget, planNotice, type PlanNotice, type PlanWithOrigin, type RunningWork } from './map';
import type { DeleteResult } from './delete';
import type { ModalOption } from './modal';

type TargetPlan = Pick<PlanWithOrigin, 'workspaceFolder' | 'name' | 'folder'>;

export interface FlowDeps {
  folders(): string[];
  discoverAll(folders: string[]): Promise<PlanWithOrigin[]>;
  /** The work running on the plan, read now; `undefined` when it was not read. */
  work(planDir: string): Promise<RunningWork | undefined>;
  /** Modal with the given options (identifiers); returns the chosen identifier, and "Cancel" gives `undefined`. */
  ask(notice: PlanNotice, options: readonly ModalOption[]): Promise<ModalOption | undefined>;
  /** The plugin is active for the folder, or the user just installed it; `false` stops. */
  pluginActive(): Promise<boolean>;
  remove(root: string, planDir: string): Promise<DeleteResult>;
  openExisting(plan: TargetPlan): Promise<void>;
  /** The action prompt, built by the agent provider. */
  prompt(action: AgentAction): string;
  /** Opens the agent with the prompt (or copies it). `workspaceFolder`: the workspace folder the plan comes from. */
  openAgent(prompt: string, workspaceFolder: string): Promise<string>;
  requestLoad(): void;
  alert(text: string): void;
  error(text: string): void;
  channel: { info(text: string): void; warn(text: string): void };
  /** The language of notices and the output channel (English without it). */
  strings?: Strings;
}

export type MapEnd = 'opened' | 'existing' | 'cancelled' | 'outside' | 'no-plugin' | 'error';

async function deleteAndLoad(plan: TargetPlan, deps: FlowDeps): Promise<boolean> {
  const { t } = deps.strings ?? stringsFor();
  const r = await deps.remove(plan.workspaceFolder, plan.folder);
  deps.requestLoad();
  if (!r.ok) {
    const alreadyInTrash = r.deleted.length ? t('log.alreadyInTrash', r.deleted.join(', ')) : '';
    deps.channel.warn(t('log.deleteFailed', plan.name, r.error, alreadyInTrash));
    deps.error(t('notice.brand', r.error));
    return false;
  }
  deps.channel.info(t('log.deleteTrash', plan.name, r.deleted.join(', ')));
  return true;
}

/** "Create tasks from this plan" for the `.md` at `md` (absolute path). */
export async function mapIdea(md: string, deps: FlowDeps): Promise<MapEnd> {
  const strings = deps.strings ?? stringsFor();
  const { t } = strings;
  const folders = deps.folders();
  const target = mapTarget(md, folders, await deps.discoverAll(folders));
  if (!target) {
    deps.channel.warn(t('log.mapOutside', md));
    deps.alert(t('notice.brand', t('notice.outsideWorkspace')));
    return 'outside';
  }
  const { existing } = target;
  if (existing) {
    const notice = planNotice(existing.name, 'map', await deps.work(existing.folder), strings);
    deps.channel.info(t(notice.strong ? 'log.mapAlreadyDoneStrong' : 'log.mapAlreadyDone', target.relativePath, existing.name));
    const answer = await deps.ask(notice, ['open-existing', 'delete-and-map']);
    deps.channel.info(t('log.answer', inChannel('map', strings), answer ?? t('log.cancel')));
    if (answer === 'open-existing') {
      await deps.openExisting(existing);
      return 'existing';
    }
    if (answer !== 'delete-and-map') return 'cancelled';
  }
  // The plugin is checked before deleting: declining the install does not leave the plan deleted and unmapped.
  if (!(await deps.pluginActive())) {
    deps.channel.info(t('log.mapNoPlugin'));
    return 'no-plugin';
  }
  if (existing && !(await deleteAndLoad(existing, deps))) return 'error';
  const path = await deps.openAgent(deps.prompt({ map: target.relativePath }), target.workspaceFolder);
  deps.channel.info(`${inChannel('map', strings)}: ${target.relativePath} → ${inChannel(path, strings)}`);
  return 'opened';
}

/** "Delete" on the plan card. */
export async function deleteFromCard(plan: TargetPlan, deps: FlowDeps): Promise<'deleted' | 'cancelled' | 'error'> {
  const strings = deps.strings ?? stringsFor();
  const { t } = strings;
  const notice = planNotice(plan.name, 'delete', await deps.work(plan.folder), strings);
  deps.channel.info(t(notice.strong ? 'log.deleteWarningStrong' : 'log.deleteWarning', plan.name));
  const answer = await deps.ask(notice, ['delete']);
  deps.channel.info(t('log.answer', inChannel('delete', strings), answer ?? t('log.cancel')));
  if (answer !== 'delete') return 'cancelled';
  return (await deleteAndLoad(plan, deps)) ? 'deleted' : 'error';
}

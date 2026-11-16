// The actions of the panel's "Ideas" section: "Refine" (refine skill), "Create tasks" (map skill, which accepts an idea)
// and "Open". The idea must come from the last read. The flows receive their dependencies from outside so they can be
// tested without `vscode`, the same ones as "Run" (`ActionDeps`).
import { stringsFor } from '@plan-relay/i18n';
import type { DiscoveredIdea } from '@plan-relay/reader';
import { inChannel } from '../channel';
import type { ActionDeps } from './execute';
import type { PlanNotice } from './map';

/** What the actions use from a read idea. */
export type IdeaTarget = Pick<DiscoveredIdea, 'folder' | 'file' | 'slug' | 'title' | 'status' | 'openQuestions'>;

export type IdeaAction = 'refine' | 'map' | 'open';

export type IdeaTargetResult = { idea: IdeaTarget } | { error: string };

/**
 * The target of a section message: the idea must be one from the last read. Refine and create tasks do not apply to
 * a `mapped` idea (already became a plan) nor an `invalid` one; open applies to all. `error` is the line for the output channel.
 */
export function ideaTarget(ideas: readonly IdeaTarget[], id: string, action: IdeaAction, strings = stringsFor()): IdeaTargetResult {
  const idea = ideas.find((i) => i.file === id);
  if (!idea) return { error: strings.t('log.unknownIdea', inChannel(action, strings), id) };
  if (action !== 'open' && (idea.status === 'mapped' || idea.status === 'invalid')) {
    return { error: strings.t('log.ideaNoButton', inChannel(action, strings), idea.slug, idea.status) };
  }
  return { idea };
}

/** The idea file relative to the workspace folder, with `/`: it is the skills' argument. */
export function ideaPath(idea: Pick<IdeaTarget, 'slug'>): string {
  return `agent_plans/_ideas/${idea.slug}.md`;
}

/** "Refine": plugin required; opens the agent with the refine skill and the idea file. */
export async function startRefine(idea: IdeaTarget, deps: ActionDeps): Promise<'opened' | 'no-plugin'> {
  const strings = deps.strings ?? stringsFor();
  const { t } = strings;
  const line = `ideaRefine: ${idea.slug} (${idea.status})`;
  if (!(await deps.plugin())) {
    deps.channel.info(t('log.stoppedPlugin', line));
    return 'no-plugin';
  }
  const path = await deps.openAgent(deps.prompt({ refine: ideaPath(idea) }), idea.folder);
  deps.channel.info(`${line} → ${inChannel(path, strings)}`);
  return 'opened';
}

/** "New idea": plugin required, as in "Refine"; opens the agent with the idea skill, without an argument, in `folder`. */
export async function newIdea(folder: string, deps: ActionDeps): Promise<'opened' | 'no-plugin'> {
  const strings = deps.strings ?? stringsFor();
  const { t } = strings;
  if (!(await deps.plugin())) {
    deps.channel.info(t('log.stoppedPlugin', 'ideaNew'));
    return 'no-plugin';
  }
  const path = await deps.openAgent(deps.prompt({ idea: true }), folder);
  deps.channel.info(`ideaNew → ${inChannel(path, strings)}`);
  return 'opened';
}

/**
 * The workspace folder where the ideas live: that of the ideas read; without ideas, the first workspace folder (where
 * the agent session opens and the idea skill writes); without any folder, nothing.
 */
export function ideasFolder(ideas: readonly Pick<IdeaTarget, 'folder'>[], folders: readonly string[]): string | undefined {
  return ideas[0]?.folder ?? folders[0];
}

/**
 * "Create tasks": plugin required; with open questions, or an unknown count, it warns and lets the user proceed
 * ("Create anyway") or cancel. Opens the agent with the map skill and the idea file.
 */
export async function createTasksFromIdea(idea: IdeaTarget, deps: ActionDeps): Promise<'opened' | 'no-plugin' | 'cancelled'> {
  const strings = deps.strings ?? stringsFor();
  const { t } = strings;
  const line = `ideaMap: ${idea.slug} (${idea.status})`;
  if (!(await deps.plugin())) {
    deps.channel.info(t('log.stoppedPlugin', line));
    return 'no-plugin';
  }
  if (idea.openQuestions !== 0) {
    const notice: PlanNotice = {
      strong: false,
      text:
        idea.openQuestions === null
          ? t('notice.ideaQuestionsUnknown', idea.title)
          : t('notice.ideaQuestions', idea.title, idea.openQuestions),
      detail: t('notice.ideaRefine'),
    };
    deps.channel.info(t('log.ideaCreateTasks', idea.slug, String(idea.openQuestions)));
    const answer = await deps.ask(notice, ['map-anyway']);
    deps.channel.info(t('log.answer', 'ideaMap', answer ?? t('log.cancel')));
    if (answer !== 'map-anyway') return 'cancelled';
  }
  const path = await deps.openAgent(deps.prompt({ map: ideaPath(idea) }), idea.folder);
  deps.channel.info(`${line} → ${inChannel(path, strings)}`);
  return 'opened';
}

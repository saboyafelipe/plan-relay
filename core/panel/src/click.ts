// The click on an element with `data-action`, translated into what the page does with it or the message it sends.
import type { WebviewMessage } from './messages';
import type { TaskGroup } from './input';
import type { IdeaState } from './filter';
import type { Tab } from './render';
import { isGroup, isIdeaState, isTab, type TasksView } from './saved';

/** The clicks that stay in the page: they change what is drawn and never reach the host. */
export type LocalClick =
  | { type: 'toggle'; plan: string }
  | { type: 'tab'; tab: Tab }
  | { type: 'menu'; plan: string }
  | { type: 'phase'; plan: string; phase: string }
  | { type: 'more'; plan: string; phase: string }
  | { type: 'group'; plan: string; group: TaskGroup }
  | { type: 'nowSection'; plan: string; group: TaskGroup }
  | { type: 'chip'; group: TaskGroup }
  | { type: 'ideaChip'; status: IdeaState }
  | { type: 'ideasSection'; status: IdeaState }
  /** The «→ plan» link of the mapped idea: `plan` is the `Plan:` of the idea, not the `id` of the plan. */
  | { type: 'ideaPlan'; plan: string }
  | { type: 'advanced' }
  | { type: 'view'; view: TasksView }
  | { type: 'clear' }
  | { type: 'collapseAll' }
  | { type: 'detail'; plan: string; id: string }
  /** The detail of an idea, by its file: where the keyboard reaches the actions of the row. */
  | { type: 'ideaDetail'; idea: string }
  /** The link to the row of another task of the plan: the replacement of the cancelled one, the root of the abandoned one. */
  | { type: 'go'; plan: string; id: string }
  | { type: 'close' };

/** The click on an element with `data-action`: something that stays in the page or a message to the host. */
export type Click = LocalClick | WebviewMessage;

/** Translates the `data-*` of the clicked element; what does not form a complete action gives `undefined`. */
export function clickOf(data: {
  action?: string;
  plan?: string;
  file?: string;
  id?: string;
  idea?: string;
  tab?: string;
  phase?: string;
  group?: string;
  view?: string;
  status?: string;
}): Click | undefined {
  const { action, plan, file, id, idea, tab, phase, group, view, status } = data;
  switch (action) {
    case 'toggle':
      return plan ? { type: 'toggle', plan } : undefined;
    case 'tab':
      return isTab(tab) ? { type: 'tab', tab } : undefined;
    case 'menu':
      return plan ? { type: 'menu', plan } : undefined;
    case 'phase':
      return plan && phase ? { type: 'phase', plan, phase } : undefined;
    case 'more':
      return plan && phase ? { type: 'more', plan, phase } : undefined;
    case 'group':
      return plan && isGroup(group) ? { type: 'group', plan, group } : undefined;
    case 'now-section':
      return plan && isGroup(group) ? { type: 'nowSection', plan, group } : undefined;
    case 'chip':
      // The Ideas chip carries the idea state; the Now and Plans ones, the task group.
      if (status !== undefined) return isIdeaState(status) ? { type: 'ideaChip', status } : undefined;
      return isGroup(group) ? { type: 'chip', group } : undefined;
    case 'advanced':
      return { type: 'advanced' };
    case 'view':
      return view === 'phase' || view === 'status' ? { type: 'view', view } : undefined;
    case 'clear':
      return { type: 'clear' };
    case 'collapse-all':
      return { type: 'collapseAll' };
    case 'detail':
      return plan && id ? { type: 'detail', plan, id } : undefined;
    case 'go':
      return plan && id ? { type: 'go', plan, id } : undefined;
    case 'close':
      return { type: 'close' };
    case 'copy':
      // The command text belongs to the agent provider, in the host: the page only says which plan (and, in the detail, which task).
      return plan ? { type: 'copy', plan, ...(id ? { id } : {}) } : undefined;
    case 'refresh':
      return { type: 'refresh' };
    case 'install':
      // The host asks for the scope and answers with «installing» and, at the end, with the new status.
      return { type: 'install' };
    case 'delete':
      // The host asks before deleting; the card disappears on the next load.
      return plan ? { type: 'delete', plan } : undefined;
    case 'execute':
      // «Execute» and «Resume»: the host checks the task in the last read and opens the agent.
      return plan && id ? { type: 'execute', plan, id } : undefined;
    case 'run':
      return plan ? { type: 'run', plan } : undefined;
    case 'giveUp':
    case 'reopen':
      // The host rereads the plan, confirms with the owner and writes: the page only says which task.
      return plan && id ? { type: action, plan, id } : undefined;
    case 'open':
      return plan && file ? { type: 'open', plan, file } : undefined;
    case 'idea-refine':
      return idea ? { type: 'ideaRefine', idea } : undefined;
    case 'idea-map':
      // The warning about open questions belongs to the host: it reads the idea in the last read, not the page.
      return idea ? { type: 'ideaMap', idea } : undefined;
    case 'idea-detail':
      return idea ? { type: 'ideaDetail', idea } : undefined;
    case 'idea-open':
      return idea ? { type: 'ideaOpen', idea } : undefined;
    case 'idea-new':
      return { type: 'ideaNew' };
    case 'ideas-folder':
      return { type: 'ideaFolder' };
    case 'ideas-section':
      return isIdeaState(status) ? { type: 'ideasSection', status } : undefined;
    case 'idea-plan':
      return plan ? { type: 'ideaPlan', plan } : undefined;
    default:
      return undefined;
  }
}

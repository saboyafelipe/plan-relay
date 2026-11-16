// core/panel: view model, HTML render, messages, page and document of the panel, without host API.
// It depends on no host: no editor API here. The panel
// CSS (panel.css) uses only --pr-* variables, which the host defines from its theme.

export type { StatusInput, PhaseInput, TaskGroup, IdeaInput, TaskTier, PlanInput, TaskInput } from './input';
export {
  IDEA_ACTIONS,
  depthOf,
  ideasView,
  planView,
  type IdeaAction,
  type CountByGroup,
  type PhaseView,
  type TaskView,
  type IdeaView,
  type IdeasView,
  type PlanView,
} from './view';
export { decideBadge, badgeLabel, CARD_BADGES, type Badge, type CardBadge } from './badge';
export { since } from './duration';
export { errorText } from './error';
export { ACTION_ICONS, STATUS_ICONS, ring, stackedBar, icon, statusIcon, type SegmentColor, type IconName, type Segment } from './icons';
export { pageKey, escapeHtml, openPhasesByDefault, PER_PAGE, render, statusText } from './render';
export { environmentView, type EnvironmentView } from './footer';
export {
  isWebviewMessage,
  isHostMessage,
  type EnvironmentInput,
  type EnvironmentMessage,
  type CheckStatus,
  type CheckInput,
  type PluginScope,
  type PluginState,
  type LoadingMessage,
  type WebviewMessage,
  type StatusMessage,
  type HostMessage,
  type PluginMessage,
  type PluginView,
} from './messages';
export {
  clickOf,
  readSaved,
  SAVED_VERSION,
  bindPanel,
  type HostChannel,
  type Click,
  type Filters,
  type FiltersByTab,
  type Saved,
  type PanelOptions,
  type PanelBinding,
  type TasksView,
} from './page';
export { confirmationDocument, panelDocument, type DocumentResources } from './document';
export {
  isConfirmationReply,
  confirmationHtml,
  bindConfirmation,
  replyOf,
  confirmationTitle,
  type ConfirmationData,
  type ConfirmationReply,
} from './confirmation';

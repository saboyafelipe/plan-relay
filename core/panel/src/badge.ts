import type { Strings } from '@plan-relay/i18n';
import type { StatusInput } from './input';

/** The badge of the plan card: a stable identifier in ASCII English. The CSS class (`badge-<id>`) and the tests use the identifier; the displayed text is the `badge.<id>` key of `core/i18n`. */
export type Badge = 'done' | 'run-open' | 'owner' | 'in-progress' | 'idle';

/** The badge of a plan that was not read: it does not come from `decideBadge`, it comes from the `error` of the view. */
export type CardBadge = Badge | 'error';

export const CARD_BADGES: readonly CardBadge[] = ['done', 'run-open', 'owner', 'in-progress', 'idle', 'error'];

/** The badge text in the language of the strings; changing the text does not change the class. */
export function badgeLabel(badge: CardBadge, strings: Strings): string {
  return strings.t(`badge.${badge}`);
}

/** The badge of the plan card, by precedence: done, pilot, owner, in progress, idle. */
export function decideBadge(status: StatusInput): Badge {
  const { done, total } = status.progress;
  if (total > 0 && done === total) return 'done';
  if (status.run?.open) return 'run-open';
  if (status.tasks.some((t) => t.group === 'owner')) return 'owner';
  if (status.tasks.some((t) => t.group === 'in-progress')) return 'in-progress';
  return 'idle';
}

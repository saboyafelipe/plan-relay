import { stringsFor, type Strings } from '@plan-relay/i18n';
import { errorText } from '@plan-relay/panel';
import { inChannel } from '../channel';
import type { LoadedPlan } from '../plans/load';
import type { RefreshReason } from './schedule';

export interface ChannelLine {
  tier: 'info' | 'warn';
  text: string;
}

/** What a load writes to the output channel: one line per plan, with the load reason. */
export function refreshLines(reason: RefreshReason, plans: LoadedPlan[], strings: Strings = stringsFor()): ChannelLine[] {
  const { t } = strings;
  const m = inChannel(reason, strings);
  if (plans.length === 0) return [{ tier: 'info', text: t('log.updatedNone', m) }];
  return plans.map((p): ChannelLine => {
    if ('error' in p) return { tier: 'warn', text: t('log.updatedError', m, p.name, errorText(p.error, strings)) };
    const { in_progress, done } = p.status.progress;
    return { tier: 'info', text: t('log.updated', m, p.name, in_progress, done) };
  });
}

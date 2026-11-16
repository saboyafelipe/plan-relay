// The footer's environment: the general checks from core/reader and the provider's, in the shape of
// `check.sh --json`, without running sh; and the output channel lines with each one's detail.
import { environmentOf, generalChecks, type Environment, type EnvironmentDeps, type Check } from '@plan-relay/reader';
import type { PluginView } from '@plan-relay/panel';
import { stringsFor, type Strings } from '@plan-relay/i18n';
import type { Provider } from './agents/provider';
import { errorMessage } from './util';

/**
 * The general ones and, with a provider and folder, the provider's after them. Does not reject: a provider failure
 * becomes an `agent` unknown check (unknown is never an error), with the reason in the detail.
 */
export async function readEnvironment(
  provider: Pick<Provider, 'checksList'> | undefined,
  folder: string | undefined,
  plugin: PluginView | undefined,
  deps: EnvironmentDeps,
): Promise<Environment> {
  const general = generalChecks(deps);
  let fromAgent: Check[] = [];
  if (provider?.checksList && folder !== undefined) {
    try {
      fromAgent = await provider.checksList(folder, plugin);
    } catch (error) {
      const { t } = deps.strings ?? stringsFor();
      fromAgent = [{ id: 'agent', status: 'unknown', required: false, detail: t('environment.agentFailed', errorMessage(error)) }];
    }
  }
  return environmentOf([...general, ...fromAgent]);
}

export interface ChannelLine {
  tier: 'info' | 'warn';
  text: string;
}

/** One line per check, with the detail (how to fix it); missing and warning at warn level. */
export function environmentLines(environment: Environment, strings: Strings = stringsFor()): ChannelLine[] {
  const { t } = strings;
  return environment.checks.map((c) => ({
    tier: c.status === 'missing' || c.status === 'warning' ? 'warn' : 'info',
    text: t('log.environment', c.id, c.status, t(c.required ? 'environment.required' : 'environment.optional'), c.detail),
  }));
}

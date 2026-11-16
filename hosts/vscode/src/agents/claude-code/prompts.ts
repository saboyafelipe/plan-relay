// The Claude Code prompts for each panel action: the plugin's skills with the prefix of the installed package. Pure.
import type { AgentAction } from '../provider';
import { skillPrefix, type PluginName } from './plugin-name';

/** The prompt for the action; `plugin` is the installed package (English when it is not known). */
export function claudeCodePrompt(action: AgentAction, plugin: PluginName = 'plan-relay'): string {
  const prefix = skillPrefix(plugin);
  if ('refine' in action) return `${prefix}refine ${action.refine}`;
  if ('map' in action) return `${prefix}map ${action.map}`;
  if ('plan' in action) return `${prefix}plan ${action.plan} ${action.id}`;
  if ('idea' in action) return `${prefix}idea`;
  return `${prefix}run agent_plans/${action.run}`;
}

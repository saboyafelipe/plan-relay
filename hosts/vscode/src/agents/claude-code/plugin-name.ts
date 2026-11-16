// The two packages the plan-relay marketplace serves: English as `plan-relay`, the one a user gets without
// choosing, and pt-BR as `plan-relay-pt-br`. The CLI id is `<name>@plan-relay`, and the skill prefix follows the
// name (`/plan-relay:plan`, `/plan-relay-pt-br:plan`): tools/build.sh writes it per package. Pure.

/** The marketplace name (`.claude-plugin/marketplace.json`). */
export const MARKETPLACE = 'plan-relay';

/** The package names, in the marketplace order (a test checks it). */
export const PLUGIN_NAMES = ['plan-relay', 'plan-relay-pt-br'] as const;

export type PluginName = (typeof PLUGIN_NAMES)[number];

/** The package for the editor language (`vscode.env.language`): any Portuguese gets pt-BR, anything else English. */
export function pluginForLanguage(language: string): PluginName {
  return /^pt(-|$)/i.test(language) ? 'plan-relay-pt-br' : 'plan-relay';
}

export function pluginId(name: PluginName): string {
  return `${name}@${MARKETPLACE}`;
}

/** The package of a CLI id, or `undefined` when the id is not one of ours. */
export function pluginOfId(id: string): PluginName | undefined {
  return PLUGIN_NAMES.find((name) => pluginId(name) === id);
}

export function skillPrefix(name: PluginName): string {
  return `/${name}:`;
}

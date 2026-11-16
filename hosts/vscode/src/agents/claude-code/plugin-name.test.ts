import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARKETPLACE, PLUGIN_NAMES, pluginForLanguage, pluginId, pluginOfId, skillPrefix } from './plugin-name';

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..', '..');

describe('plugin-name', () => {
  it('English is plan-relay, the one a user gets without choosing; pt-BR is plan-relay-pt-br', () => {
    expect(PLUGIN_NAMES).toEqual(['plan-relay', 'plan-relay-pt-br']);
    expect(pluginForLanguage('en')).toBe('plan-relay');
    expect(pluginForLanguage('pt-BR')).toBe('plan-relay-pt-br');
  });

  it('the editor language picks the package: any Portuguese gets pt-BR, anything else English', () => {
    expect(pluginForLanguage('pt-br')).toBe('plan-relay-pt-br');
    expect(pluginForLanguage('pt')).toBe('plan-relay-pt-br');
    expect(pluginForLanguage('pt-PT')).toBe('plan-relay-pt-br');
    expect(pluginForLanguage('fr')).toBe('plan-relay');
    expect(pluginForLanguage('ptx')).toBe('plan-relay');
    expect(pluginForLanguage('')).toBe('plan-relay');
  });

  it('the CLI id is <name>@plan-relay, and only the two packages are read back', () => {
    expect(pluginId('plan-relay')).toBe('plan-relay@plan-relay');
    expect(pluginId('plan-relay-pt-br')).toBe('plan-relay-pt-br@plan-relay');
    expect(pluginOfId('plan-relay-pt-br@plan-relay')).toBe('plan-relay-pt-br');
    expect(pluginOfId('plan-relay@plan-relay')).toBe('plan-relay');
    expect(pluginOfId('plan-relay@another')).toBeUndefined();
    expect(pluginOfId('plan-relay-en@plan-relay')).toBeUndefined();
  });

  it('the skill prefix follows the plugin name', () => {
    expect(skillPrefix('plan-relay')).toBe('/plan-relay:');
    expect(skillPrefix('plan-relay-pt-br')).toBe('/plan-relay-pt-br:');
  });

  it(`agent.conf's AGENT_PLUGIN_SKILL_PREFIX is /<plugin name>:, filled per package by the build`, () => {
    const conf = readFileSync(resolve(ROOT, 'agents', 'claude-code', 'agent.conf'), 'utf8');
    const line = conf.split('\n').find((l) => l.startsWith('AGENT_PLUGIN_SKILL_PREFIX='));
    expect(line?.slice('AGENT_PLUGIN_SKILL_PREFIX='.length)).toBe('/{{PLUGIN_NAME}}:');
  });

  it('the marketplace serves the same names, from the generated packages', () => {
    const mk = JSON.parse(readFileSync(resolve(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8')) as {
      name: string;
      plugins: Array<{ name: string; source: string }>;
    };
    expect(mk.name).toBe(MARKETPLACE);
    expect(mk.plugins.map((p) => p.name)).toEqual([...PLUGIN_NAMES]);
    for (const p of mk.plugins) {
      const manifest = JSON.parse(readFileSync(resolve(ROOT, p.source, '.claude-plugin', 'plugin.json'), 'utf8')) as { name: string };
      expect(manifest.name, p.source).toBe(p.name);
    }
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SOURCE } from './agents/claude-code/install';

// What the stores (Marketplace and Open VSX) read from the manifest.
const FOLDER = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(FOLDER, 'package.json'), 'utf8')) as Record<string, unknown> & {
  repository?: { type: string; url: string };
  homepage?: string;
  bugs?: { url: string };
  keywords?: string[];
  categories: string[];
  scripts: Record<string, string>;
  contributes: { menus: Record<string, { command: string; when?: string }[] | undefined> };
};

// The list VS Code accepts in `categories` (the product's, 1.146; the manifest docs page does not yet
// list AI, Azure and Chat).
const CATEGORIES = [
  'AI',
  'Azure',
  'Chat',
  'Data Science',
  'Debuggers',
  'Extension Packs',
  'Education',
  'Formatters',
  'Keymaps',
  'Language Packs',
  'Linters',
  'Machine Learning',
  'Notebooks',
  'Programming Languages',
  'SCM Providers',
  'Snippets',
  'Testing',
  'Themes',
  'Visualization',
  'Other',
];

describe('manifest ready for the stores', () => {
  const repoRoot = `https://github.com/${DEFAULT_SOURCE}`;

  it('repository, homepage and bugs point to the repository of the plugin default source', () => {
    expect(pkg.repository).toEqual({ type: 'git', url: `${repoRoot}.git` });
    expect(pkg.homepage).toBe(`${repoRoot}#readme`);
    expect(pkg.bugs).toEqual({ url: `${repoRoot}/issues` });
  });

  it('keywords: 1 to 30, no repeats', () => {
    const k = pkg.keywords ?? [];
    expect(k.length).toBeGreaterThan(0);
    expect(k.length).toBeLessThanOrEqual(30);
    expect(new Set(k).size).toBe(k.length);
  });

  it('categories from the VS Code list, without Other', () => {
    expect(pkg.categories.length).toBeGreaterThan(0);
    expect(pkg.categories.filter((c) => !CATEGORIES.includes(c))).toEqual([]);
    expect(pkg.categories).not.toContain('Other');
  });

  it('the package script does not skip the repository check', () => {
    expect(pkg.scripts.package).not.toContain('--allow-missing-repository');
  });

  it('vsce builds the production bundle itself before packaging', () => {
    // `vsce package` and `vsce publish` run vscode:prepublish, so a direct call does not ship a stale dist/.
    expect(pkg.scripts['vscode:prepublish']).toBe('node esbuild.mjs --production');
    expect(pkg.scripts.package).not.toContain('npm run build');
  });

  it('no enabledApiProposals (the Marketplace refuses them)', () => {
    expect(pkg).not.toHaveProperty('enabledApiProposals');
  });

  it('every %…% key in the manifest has text in both package.nls*.json', () => {
    const keys = [...JSON.stringify(pkg).matchAll(/"%([\w.-]+)%"/g)].map((m) => m[1] ?? '');
    expect(keys.length).toBeGreaterThan(0);
    for (const file of ['package.nls.json', 'package.nls.pt-br.json']) {
      const nls = JSON.parse(readFileSync(join(FOLDER, file), 'utf8')) as Record<string, unknown>;
      const emptyOnes = keys.filter((k) => typeof nls[k] !== 'string' || nls[k].trim() === '');
      expect(emptyOnes, file).toEqual([]);
    }
  });

  it('declares Agents window support, next to untrustedWorkspaces', () => {
    expect(pkg).toHaveProperty('capabilities.agentsWindow.supported', true);
    expect(pkg).toHaveProperty('capabilities.untrustedWorkspaces.supported', false);
  });

  it('declares no support for virtual workspaces (the plans are read from disk and the agent runs locally)', () => {
    expect(pkg).toHaveProperty('capabilities.virtualWorkspaces', false);
  });

  it('the settings that choose what the extension runs are machine-scoped, out of reach of a repository', () => {
    // A `.vscode/settings.json` in a cloned repository must not pick the binary the extension executes, nor the
    // marketplace it installs the plugin from.
    for (const key of ['planRelay.claudePath', 'planRelay.marketplace']) {
      expect(pkg, key).toHaveProperty(['contributes', 'configuration', 'properties', key, 'scope'], 'machine');
    }
  });

  it('the palette offers the panel commands only when they can act', () => {
    // collapseAll and filter post to the panel's page, which only exists while the view is visible; map, from the
    // palette, maps the active editor, which must be a Markdown file outside agent_plans/.
    const palette = pkg.contributes.menus.commandPalette ?? [];
    const when = (command: string): string => palette.find((m) => m.command === command)?.when ?? '';
    expect(when('planRelay.collapseAll')).toContain('view.planRelay.panel.visible');
    expect(when('planRelay.collapseAll')).toContain('planRelay.tab == plans');
    expect(when('planRelay.filter')).toContain('view.planRelay.panel.visible');
    expect(when('planRelay.map')).toBe(pkg.contributes.menus['explorer/context']?.find((m) => m.command === 'planRelay.map')?.when);
  });

  it('its own README.md and CHANGELOG.md, the store page', () => {
    expect(existsSync(join(FOLDER, 'README.md'))).toBe(true);
    expect(existsSync(join(FOLDER, 'CHANGELOG.md'))).toBe(true);
  });

  it('the README links to GitHub use the repository of the default source', () => {
    const readme = readFileSync(join(FOLDER, 'README.md'), 'utf8');
    const repos = [...readme.matchAll(/(?:github\.com|raw\.githubusercontent\.com)\/([\w.-]+\/[\w.-]+)/g)].map((m) => m[1] ?? '');
    expect(repos.length).toBeGreaterThan(0);
    expect(repos.filter((r) => r !== DEFAULT_SOURCE)).toEqual([]);
  });
});

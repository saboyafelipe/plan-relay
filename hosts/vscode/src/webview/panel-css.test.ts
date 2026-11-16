import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The extension's media/panel.css: imports the core/panel CSS and defines the `--pr-*` variables
// from the VS Code theme, so the panel follows the light, dark or high contrast theme.
const EXTENSION = join(import.meta.dirname, '..', '..');
const theme = readFileSync(join(EXTENSION, 'media', 'panel.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const core = readFileSync(join(EXTENSION, '..', '..', 'core', 'panel', 'src', 'panel.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// The variables the page writes on the root (DOM measurements, like `--pr-filters-height`) do not come from the theme.
const page = readFileSync(join(EXTENSION, '..', '..', 'core', 'panel', 'src', 'page-dom.ts'), 'utf8');
const fromPage = new Set([...page.matchAll(/setProperty\('(--pr-[\w-]+)'/g)].map((m) => m[1] ?? ''));

const defined = new Map([...theme.matchAll(/(--pr-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1] ?? '', (m[2] ?? '').trim()]));

describe('architecture: media/panel.css (VS Code theme) against the core/panel CSS and page', () => {
  it('imports the core/panel CSS', () => {
    expect(theme).toMatch(/@import\s+['"]@plan-relay\/panel\/panel\.css['"];/);
  });

  it('only defines --pr-*, each from --vscode-* (with an optional fallback)', () => {
    expect(defined.size).toBeGreaterThan(0);
    for (const [name, value] of defined) {
      expect(value, name).toMatch(/^var\(--vscode-[\w-]+(?:,\s*(?:transparent|var\(--vscode-[\w-]+\)))?\)$/);
    }
    // Nothing besides the import and the definitions: no style rule of the host's own.
    const rest = theme
      .replace(/@import[^;]+;/, '')
      .replace(/:root\s*\{[^}]*\}/, '')
      .trim();
    expect(rest).toBe('');
  });

  it('wires the visual base state and selection colors to the theme variables', () => {
    expect(defined.get('--pr-state-ok')).toBe('var(--vscode-charts-green)');
    expect(defined.get('--pr-state-run')).toBe('var(--vscode-charts-blue)');
    expect(defined.get('--pr-state-wait')).toBe('var(--vscode-list-warningForeground)');
    expect(defined.get('--pr-state-owner')).toBe('var(--vscode-charts-purple)');
    expect(defined.get('--pr-selected-bg')).toBe('var(--vscode-list-activeSelectionBackground)');
    expect(defined.get('--pr-selected-fg')).toBe('var(--vscode-list-activeSelectionForeground)');
  });

  it('defines every --pr-* the core CSS uses, and no extra', () => {
    const used = new Set([...core.matchAll(/var\(\s*(--pr-[\w-]+)/g)].map((m) => m[1] ?? '').filter((v) => !fromPage.has(v)));
    expect(fromPage).toContain('--pr-filters-height');
    expect(fromPage).toContain('--pr-tabs-height');
    expect([...defined.keys()].sort()).toEqual([...used].sort());
  });

  it('the panel tabs follow the VS Code view tab colors, in a segmented control with a field background', () => {
    expect(defined.get('--pr-tab-active-fg')).toBe('var(--vscode-panelTitle-activeForeground)');
    expect(defined.get('--pr-tab-inactive-fg')).toBe('var(--vscode-panelTitle-inactiveForeground)');
    expect(defined.has('--pr-tab-active-border')).toBe(false);
    expect(defined.get('--pr-segment-bg')).toBe('var(--vscode-input-background)');
    // In high contrast the active tab outline is the theme's; in the others, the panels' subtle border.
    expect(defined.get('--pr-segment-active-border')).toBe('var(--vscode-contrastActiveBorder, var(--vscode-panel-border))');
  });
});

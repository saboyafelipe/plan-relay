import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The settings table of the store page (README.md and its pt-BR pair) lists every setting the manifest contributes.
const FOLDER = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(FOLDER, 'package.json'), 'utf8')) as {
  contributes: { configuration: { properties: Record<string, unknown> } | { properties: Record<string, unknown> }[] };
};

function settingKeys(): string[] {
  const c = pkg.contributes.configuration;
  return (Array.isArray(c) ? c : [c]).flatMap((s) => Object.keys(s.properties));
}

/**
 * The settings a README table leaves out. A setting is listed when a table row names it whole (`planRelay.claudePath`), or when a
 * row names its group with `.*` (`planRelay.notifications.*`) and the last segment on its own (`taskCancelled`).
 */
function missingFromTable(markdown: string, keys: readonly string[]): string[] {
  const rows = markdown.split('\n').filter((l) => l.startsWith('|'));
  return keys.filter((key) => {
    const cut = key.lastIndexOf('.');
    const group = `\`${key.slice(0, cut)}.*\``;
    const leaf = `\`${key.slice(cut + 1)}\``;
    return !rows.some((r) => r.includes(`\`${key}\``) || (r.includes(group) && r.includes(leaf)));
  });
}

describe('settings table of the extension README', () => {
  it('reads the settings from the manifest', () => {
    expect(settingKeys()).toContain('planRelay.claudePath');
  });

  it('flags a setting the table leaves out', () => {
    const table = ['| Setting | What it does |', '|---|---|', '| `planRelay.a` | x |', '| `planRelay.n.*` | `one` |'].join('\n');
    expect(missingFromTable(table, ['planRelay.a', 'planRelay.n.one', 'planRelay.n.two', 'planRelay.b'])).toEqual([
      'planRelay.n.two',
      'planRelay.b',
    ]);
  });

  it('does not count a setting named outside the table', () => {
    expect(missingFromTable('See `planRelay.a`.\n\n| x |', ['planRelay.a'])).toEqual(['planRelay.a']);
  });

  for (const file of ['README.md', 'README.pt-BR.md']) {
    it(`${file} lists every setting of package.json`, () => {
      expect(missingFromTable(readFileSync(join(FOLDER, file), 'utf8'), settingKeys())).toEqual([]);
    });
  }
});

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

// Architecture rules. The import boundary of core/ (no vscode anywhere in core/, no Node module in the
// browser packages) is the no-restricted-imports of eslint.config.mjs, and the project references refuse
// a core file that reaches into hosts/. What stays here is what neither sees: dynamic imports and
// require of vscode, and the identifiers of the extension.
const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const PACKAGES = ['core/reader', 'core/panel', 'core/i18n'];
// Only the forms no-restricted-imports does not check: import('vscode') and require('vscode').
const LOADS_VSCODE = /(?:\bimport\s*\(\s*|\brequire\s*\(\s*)['"]vscode(?:\/[^'"]*)?['"]/;

function tsFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(?:[cm]?ts|tsx|[cm]?js)$/.test(e.name) && !e.parentPath.split(sep).includes('out'))
    .map((e) => join(e.parentPath, e.name));
}

/** The no-restricted-imports messages ESLint gives `code` as if it were the file `path` (relative to the root). */
async function restricted(path: string, code: string): Promise<string[]> {
  // The probe files do not exist, so the type-aware parser has no project for them: turn the type
  // information off here, which leaves the import boundary (a syntactic rule) as it is.
  const eslint = new ESLint({ cwd: ROOT, overrideConfig: tseslint.configs.disableTypeChecked });
  const [result] = await eslint.lintText(code, { filePath: join(ROOT, path) });
  if (result === undefined) throw new Error(`ESLint returned no result for ${path}`);
  return result.messages.filter((m) => m.ruleId === 'no-restricted-imports').map((m) => m.message);
}

describe('architecture', () => {
  it.each([
    ['core/reader/src/probe.ts', "import * as vscode from 'vscode';"],
    ['core/panel/src/probe.ts', "import { window } from 'vscode';"],
    ['core/i18n/src/probe.ts', "import 'vscode';"],
    ['core/reader/src/probe.test.ts', "import type { Uri } from 'vscode/types';"],
    ['core/panel/src/probe.ts', "import { readFileSync } from 'node:fs';"],
    ['core/panel/src/probe.ts', "import { join } from 'path';"],
    ['core/panel/src/probe.ts', "import { readFile } from 'fs/promises';"],
    ['core/i18n/src/probe.ts', "import { release } from 'node:os';"],
    ['core/panel/src/probe.ts', "import { nodeFiles } from '@plan-relay/reader/node';"],
    ['core/reader/src/probe.ts', "import { join } from 'node:path';"],
    ['core/reader/src/probe.ts', "import { readFileSync } from 'fs';"],
  ])('the lint boundary refuses, in %s: %s', async (path, code) => {
    expect(await restricted(path, code)).toHaveLength(1);
  });

  it.each([
    ['core/reader/src/node.ts', "import { join } from 'node:path';"],
    ['core/reader/src/testing/probe.ts', "import { readFileSync } from 'node:fs';"],
    ['core/reader/src/probe.test.ts', "import { join } from 'node:path';"],
    ['core/panel/src/probe.ts', "import { isValidReason } from '@plan-relay/reader';"],
    ['core/panel/src/probe.ts', "import { stringsFor } from '@plan-relay/i18n';"],
    ['core/panel/src/probe.test.ts', "import { readFileSync } from 'node:fs';"],
    ['core/panel/src/probe.ts', "import { x } from './vscode-like';"],
    ['hosts/vscode/src/probe.ts', "import * as vscode from 'vscode';"],
  ])('the lint boundary accepts, in %s: %s', async (path, code) => {
    expect(await restricted(path, code)).toEqual([]);
  });

  it('core/reader, core/panel and core/i18n do not load vscode dynamically', () => {
    const offenders = PACKAGES.flatMap((p) => tsFiles(join(ROOT, p)))
      .filter((f) => LOADS_VSCODE.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it('the fixed Claude Code identifiers only appear in its provider', () => {
    const src = join(ROOT, 'hosts', 'vscode', 'src');
    const provider = join(src, 'agents', 'claude-code');
    // The [x] classes keep this line from matching a plain grep for the identifiers it lists.
    const fixedIds = /anthropic\.claude-code|claude-vs[c]ode|native-bin[a]ry|plan-relay@plan-rela[y]|\.claude\/skills|skillExist[e]/;
    const offenders = readdirSync(src, { withFileTypes: true, recursive: true })
      .filter((e) => e.isFile())
      .map((e) => join(e.parentPath, e.name))
      .filter((f) => !f.startsWith(provider + sep) && f !== import.meta.filename)
      .filter((f) => fixedIds.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it('the public package.json identifiers start with planRelay.', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'hosts', 'vscode', 'package.json'), 'utf8')) as {
      contributes: {
        views: Record<string, { id: string }[]>;
        commands: { command: string }[];
        menus: Record<string, { command: string; group?: string }[]>;
        configuration: { properties: Record<string, unknown> };
      };
    };
    const c = pkg.contributes;
    const ids = [
      ...Object.values(c.views)
        .flat()
        .map((v) => v.id),
      ...c.commands.map((x) => x.command),
      ...Object.values(c.menus)
        .flat()
        .flatMap((m) => [m.command, ...(m.group ? [m.group] : [])]),
      ...Object.keys(c.configuration.properties),
    ];
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => !id.startsWith('planRelay.') && !id.startsWith('planRelay@') && !/^navigation(@\d+)?$/.test(id))).toEqual([]);
  });

  it('hosts/vscode/src has no old prefix', () => {
    const src = join(ROOT, 'hosts', 'vscode', 'src');
    const old = ['agent', 'Plans'].join('');
    const offenders = readdirSync(src, { withFileTypes: true, recursive: true })
      .filter((e) => e.isFile())
      .map((e) => join(e.parentPath, e.name))
      .filter((f) => readFileSync(f, 'utf8').includes(old))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it('the detector finds the dynamic ways of loading vscode', () => {
    for (const line of ["const v = require('vscode');", "const v = await import('vscode');", 'const v = await import ( "vscode/x" );']) {
      expect(LOADS_VSCODE.test(line), line).toBe(true);
    }
    expect(LOADS_VSCODE.test("import { x } from './vscode-like';")).toBe(false);
    expect(LOADS_VSCODE.test("const x = await import('./vscode-like');")).toBe(false);
  });
});

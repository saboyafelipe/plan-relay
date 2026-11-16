import { readdirSync, readFileSync, type Dirent } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Displayed text lives in core/i18n: the non-test code in the folders below has no
// literal that looks like text for people. Criterion: with the comments, the HTML tags and the
// `${…}` stripped, what is left in the literal is an accented letter, two words separated by a space or a "…".
// Output channel messages and internal errors fall under the same rule; whatever is an exception goes into
// EXCEPTIONS with the reason.
const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const FOLDERS = ['core/reader/src', 'core/panel/src', 'hosts/vscode/src'];
const MARK = '\u0001';
const M = MARK;
/** Literals that look like text and are not UI: `file` → exact texts (MARK in place of each `${…}`). */
const EXCEPTIONS: Record<string, string[]> = {
  // Task header key from the contract: the reader looks for it in the file, it does not display it.
  'core/reader/src/status.ts': ['Blocked by', 'Replaced by', 'Given up by', 'Given up with'],
  // The lines that cancel, give up and resume write and read in the header (contract).
  'core/reader/src/edit.ts': [
    `Replaced by: ${M}`,
    'Given up by: owner',
    `Given up with: ${M}`,
    'Previous status: draft',
    'Previous status',
  ],
  // The product name and the agent name are brands: they are not translated ("Plan Relay" also in the manifest).
  'hosts/vscode/src/extension.ts': ['Plan Relay'], // the output channel name
  'hosts/vscode/src/panel-view.ts': ['Plan Relay'], // the editor panel title
  'hosts/vscode/src/agents/claude-code/open.ts': ['Claude Code'],
  // Ellipsis for truncating a long text, with no word.
  'hosts/vscode/src/process.ts': [`${M}…`],
  // Commands: the prompt is the skill with arguments, and the install text quotes the CLI (a core/i18n argument).
  'hosts/vscode/src/agents/claude-code/prompts.ts': [`${M}run agent_plans/${M}`],
  'hosts/vscode/src/agents/claude-code/index.ts': [
    `claude plugin marketplace add ${M}`,
    `claude plugin install ${M}`,
    `claude: plugin list (${M}: ${M}, ${M} ms)`,
  ],
  'hosts/vscode/src/agents/claude-code/install.ts': [`plugin: marketplace add ${M}`],
};

/** The text literals of TS/JS code: strings and templates (with `${…}` replaced by MARK), without comments or regexes. */
function literals(code: string): string[] {
  const found: string[] = [];
  let i = 0;
  let lastOne = ''; // the last significant code character, to tell a regex from a division

  function readString(quoted: string): string {
    let s = '';
    i++;
    while (i < code.length && code[i] !== quoted) {
      if (code[i] === '\\') {
        s += code[i + 1] ?? '';
        i += 2;
        continue;
      }
      s += code[i++];
    }
    i++;
    return s;
  }

  function readRegex(): void {
    i++;
    let cls = false;
    while (i < code.length) {
      const c = code[i];
      if (c === '\\') i += 2;
      else {
        i++;
        if (c === '[') cls = true;
        else if (c === ']') cls = false;
        else if (c === '/' && !cls) break;
      }
    }
    while (/[a-z]/i.test(code[i] ?? '')) i++;
  }

  function readTemplate(): string {
    let s = '';
    i++;
    while (i < code.length && code[i] !== '`') {
      if (code[i] === '\\') {
        s += code[i + 1] ?? '';
        i += 2;
      } else if (code[i] === '$' && code[i + 1] === '{') {
        i += 2;
        readCode('}');
        i++;
        s += MARK;
      } else s += code[i++];
    }
    i++;
    return s;
  }

  /** Reads code up to the same-level `end` (or the end of the text), collecting the literals. */
  function readCode(finished?: string): void {
    let tier = 0;
    while (i < code.length) {
      const c = code[i] ?? '';
      const d = code[i + 1];
      if (c === '/' && d === '/') {
        while (i < code.length && code[i] !== '\n') i++;
      } else if (c === '/' && d === '*') {
        const f = code.indexOf('*/', i + 2);
        i = f < 0 ? code.length : f + 2;
      } else if (c === '/' && (lastOne === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(lastOne) || /\breturn\s*$/.test(code.slice(0, i)))) {
        readRegex();
        lastOne = 'r';
      } else if (c === '"' || c === "'") {
        found.push(readString(c));
        lastOne = 's';
      } else if (c === '`') {
        found.push(readTemplate());
        lastOne = 's';
      } else if (c === '{') {
        tier++;
        lastOne = c;
        i++;
      } else if (c === '}') {
        if (tier === 0 && finished === '}') return;
        tier--;
        lastOne = c;
        i++;
      } else {
        if (!/\s/.test(c)) lastOne = c;
        i++;
      }
    }
  }

  readCode();
  return found;
}

/**
 * Does the literal look like text for people? Markup is not: a tag, and an attribute list built apart from its tag
 * (`class="btn pri" data-action="back"`), which is what a tag's attributes are anyway.
 */
function looksLikeText(literal: string): boolean {
  const rest = literal
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\w-]+="[^"]*"/g, ' ')
    .split(MARK)
    .join(' ');
  return /[À-ÿ]/.test(rest) || /\p{L}\s+\p{L}/u.test(rest) || rest.includes('…');
}

/** The code `.ts` files; excluded are the tests: `*.test.ts`, the test folders and the integration suite in `integration/`. */
function codeFiles(folder: string): string[] {
  const testPlans = (e: Dirent) =>
    /\.test\.ts$/.test(e.name) ||
    e.parentPath.includes('/teste') ||
    e.parentPath.includes('/testing') ||
    e.parentPath.includes('/integration');
  return readdirSync(folder, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.ts$/.test(e.name) && !testPlans(e))
    .map((e) => join(e.parentPath, e.name));
}

describe('architecture: displayed text only in core/i18n', () => {
  it('the detector tells text apart from identifier, comment and regex', () => {
    expect(literals('const a = \'Abrir plano\'; // \'ignorado aqui\'\n/* "também" */ const b = "x";')).toEqual(['Abrir plano', 'x']);
    expect(literals('t.replace(/[&<>"\']/g, (c) => M[c]);')).toEqual([]);
    expect(literals('const h = `<b class="${c ? `a b` : \'c\'}">${x}</b>`;')).toEqual(['a b', 'c', `<b class="${MARK}">${MARK}</b>`]);
    expect(literals('const q = a / b; const r = "z";')).toEqual(['z']);
    for (const text of [
      'Abrir plano',
      'concluído',
      'Instalando…',
      '<span>Plugin ativo</span>',
      `há ${MARK} min`,
      'class="x" Abrir plano',
    ]) {
      expect(looksLikeText(text), text).toBe(true);
    }
    for (const id of [
      'in-progress',
      '<button type="button" class="action execute">',
      `badge-${MARK}`,
      "default-src 'none'",
      'width=device-width, initial-scale=1.0',
      'class="btn pri" data-action="back"',
      `class="ib funnel${MARK}" data-action="advanced" aria-expanded="${MARK}"${MARK}`,
    ]) {
      expect(looksLikeText(id), id).toBe(false);
    }
  });

  it('non-test code has no text literal outside core/i18n', () => {
    const offenders = FOLDERS.flatMap((p) => codeFiles(join(ROOT, p))).flatMap((file) => {
      const rel = relative(ROOT, file);
      const exceptions = EXCEPTIONS[rel] ?? [];
      return literals(readFileSync(file, 'utf8'))
        .filter((l) => looksLikeText(l) && !exceptions.includes(l))
        .map((l) => `${rel}: ${l.split(MARK).join('${…}')}`);
    });
    expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([]);
  });

  it('every exception still exists in its file', () => {
    const leftovers = Object.entries(EXCEPTIONS).flatMap(([rel, strings]) => {
      const found = literals(readFileSync(join(ROOT, rel), 'utf8'));
      return strings.filter((t) => !found.includes(t)).map((t) => `${rel}: ${t}`);
    });
    expect(leftovers).toEqual([]);
  });
});

describe('package.json with package.nls.json', () => {
  const folder = join(ROOT, 'hosts', 'vscode');
  const pkg = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as {
    displayName: string;
    description: string;
    capabilities: { untrustedWorkspaces: { description: string } };
    contributes: {
      viewsContainers: Record<string, { title: string }[]>;
      views: Record<string, { name: string }[]>;
      commands: { title: string; category: string }[];
      configuration: { title: string; properties: Record<string, { description: string; enumDescriptions?: string[] }> };
    };
  };
  const PRODUCT_NAME = 'Plan Relay';
  const c = pkg.contributes;
  const strings = [
    pkg.description,
    pkg.capabilities.untrustedWorkspaces.description,
    ...c.commands.map((x) => x.title),
    ...Object.values(c.configuration.properties).flatMap((p) => [p.description, ...(p.enumDescriptions ?? [])]),
  ];
  const marks = [
    pkg.displayName,
    ...Object.values(c.viewsContainers)
      .flat()
      .map((v) => v.title),
    ...Object.values(c.views)
      .flat()
      .map((v) => v.name),
    ...c.commands.map((x) => x.category),
    c.configuration.title,
  ];

  it('descriptions and titles are %key% from package.nls.json, and every nls key is used', () => {
    const nls = JSON.parse(readFileSync(join(folder, 'package.nls.json'), 'utf8')) as Record<string, string>;
    expect(strings.filter((t) => !/^%[\w.-]+%$/.test(t))).toEqual([]);
    const used = strings.map((t) => t.slice(1, -1));
    expect(used.filter((k) => typeof nls[k] !== 'string')).toEqual([]);
    expect(Object.keys(nls).filter((k) => !used.includes(k))).toEqual([]);
  });

  it('package.nls.json is English and package.nls.pt-br.json the translation, with the same keys', () => {
    const read = (file: string) => JSON.parse(readFileSync(join(folder, file), 'utf8')) as Record<string, string>;
    const fallback = read('package.nls.json');
    const ptbr = read('package.nls.pt-br.json');
    expect(Object.keys(ptbr).sort()).toEqual(Object.keys(fallback).sort());
    // The default has no pt-BR word and the translation does not repeat the English.
    expect(Object.keys(fallback).filter((k) => fallback[k] === ptbr[k])).toEqual([]);
    expect(
      Object.values(fallback).filter((v) =>
        /[ãõçé]|\b(?:Mostra|Mostrar|Atualizar|Instalar|Desinstalar|Criar tasks deste|Caminho do|Vazio)\b/.test(v),
      ),
    ).toEqual([]);
  });

  it('the product name stays literal (it is a brand, not translated)', () => {
    expect(marks.filter((m) => m !== PRODUCT_NAME)).toEqual([]);
  });
});

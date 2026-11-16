// Conformance suite of contract 1 in TypeScript: the reader runs over each case of
// core/contract/conformance/cases/ and the result has to equal the case expected.json,
// with the same rule as run.sh: scripts_version is not compared (it is the stamp of whoever runs; the
// cases carry no status.sh). describe, it and expect come from the vitest globals.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { format, stringsFor } from '@plan-relay/i18n';
import { validateStatus } from './contract';
import { giveUpClosure, isValidReason, normalizeReason, type Refusal } from './give-up';
import { cancel, giveUp, reopen, type Write } from './edit';
import { readStatus } from './status';
import { discoverIdeas } from './ideas';
import { nodeFiles } from './node';

const CASES = resolve(import.meta.dirname, '..', '..', 'contract', 'conformance', 'cases');

function withoutStamp(x: unknown): unknown {
  const { scripts_version: _ignored, ...rest } = x as Record<string, unknown>;
  return rest;
}

// The version of the scripts that the reader tracks: a case with a since file above it is left out,
// as in run.sh with a status.sh of a lower stamp. It rises with what the case asks for (9 since
// abandoned and the cancel and giveUp keys; 22 since CRLF, a space in a file name and a duplicated id).
const READER_VERSION = 22;

function since(caseName: string): number {
  try {
    return Number(readFileSync(join(CASES, caseName, 'since'), 'utf8').trim());
  } catch {
    return 0;
  }
}

const all = readdirSync(CASES, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();
// A case with expected.tsv checks the --options lines, which only status.sh prints: no host implements --options.
const isShellOnly = (c: string) => existsSync(join(CASES, c, 'expected.tsv'));
const cases = all.filter((c) => since(c) <= READER_VERSION && !isShellOnly(c));

describe('reader conformance (core/contract/conformance/cases)', () => {
  it('finds the twenty-five cases, one of them for the shell only', () => {
    expect(all.filter(isShellOnly)).toStrictEqual(['options']);
    expect(all).toStrictEqual([
      'abandoned-chain',
      'abandoned-phase',
      'abandoned-two-parents',
      'cancelled-first',
      'crlf',
      'duplicate-id',
      'empty',
      'file-name-space',
      'filter',
      'filter-id',
      'filter-words',
      'groups',
      'next-step',
      'options',
      'parallel',
      'phase-order',
      'repeated-key',
      'replaced',
      'run-closed',
      'run-handoff',
      'run-handoff-text',
      'run-open',
      'status-not-first',
      'tier',
      'title-prefix',
    ]);
  });

  /**
   * The filter of a case, read like run.sh and status.sh: the args line splits into words; --all, --options and
   * --json are options (none changes --json); any other word is the filter, and the last one counts.
   */
  function filterOf(dir: string): string | undefined {
    let words: string[] = [];
    try {
      words = readFileSync(join(dir, 'args'), 'utf8')
        .split(/\s+/)
        .filter((w) => w !== '');
    } catch {
      return undefined;
    }
    return words.filter((w) => !['--all', '--options', '--json'].includes(w)).at(-1);
  }

  it.each(cases)('%s', async (caseName) => {
    const dir = join(CASES, caseName);
    const [plan = ''] = readdirSync(join(dir, 'agent_plans'));
    const got = await readStatus(nodeFiles, join(dir, 'agent_plans', plan), filterOf(dir));
    if ('error' in got) throw new Error(JSON.stringify(got.error));
    const expected: unknown = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8'));
    expect(withoutStamp(got)).toStrictEqual(withoutStamp(expected));
    expect(got.scripts_version).toBeNull();
    expect(validateStatus(got)).not.toHaveProperty('error');
  });

  it.skip.each(all.filter(isShellOnly))('%s (shell only: no host implements --options)', () => {});
});

// The ideas (conformance/ideas/<case>/agent_plans/_ideas/*.md) have their own folder: the sh run.sh
// does not read them, because status.sh does not read ideas. The expected.json is the reader list, without the
// location (folder and file depend on where the repository is).
const IDEAS = resolve(import.meta.dirname, '..', '..', 'contract', 'conformance', 'ideas');
const ideaCases = readdirSync(IDEAS, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

describe('ideas conformance (core/contract/conformance/ideas)', () => {
  it('finds the two cases', () => {
    expect(ideaCases).toStrictEqual(['edges', 'states']);
  });

  it.each(ideaCases)('%s', async (caseName) => {
    const dir = join(IDEAS, caseName);
    const got = await discoverIdeas(nodeFiles, [dir]);
    const expected: unknown = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8'));
    expect(got.map(({ folder: _p, file: _a, ...rest }) => rest)).toStrictEqual(expected);
    for (const i of got) expect(i.file).toBe(join(dir, 'agent_plans', '_ideas', `${i.slug}.md`));
  });
});

// The edit cases (conformance/edits/<case>, shape in edits/README.md) and the reasons table
// (conformance/reasons.json): the same that edit.sh does with task.sh, with the pure functions of
// give-up.ts and edit.ts. The texts are the x-test ones of the edits/README.md table, the source that the
// cases cite; the refusal is rendered with them and compared to stderr.
const CONFORMANCE = resolve(import.meta.dirname, '..', '..', 'contract', 'conformance');
const EDITS = join(CONFORMANCE, 'edits');

const X_TEST_TABLE: Record<string, string> = Object.fromEntries(
  [...readFileSync(join(EDITS, 'README.md'), 'utf8').matchAll(/^\| `(task\.[A-Za-z]+)` \|.*\| `(x-test:[^`]*)` \|$/gm)].map((m) => [
    m[1] ?? '',
    m[2] ?? '',
  ]),
);
function xTestText(key: string): string {
  const text = X_TEST_TABLE[key];
  if (text === undefined) throw new Error(`no x-test text for ${key}`);
  return text;
}
const writeXTest: Write = (key, ...args) => format(xTestText(key), args);
const render = (r: Refusal) => format(xTestText(r.key), r.args);

/** The files under `folder`, with the path relative to it. */
function tree(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(folder, join(e.parentPath, e.name)))
    .sort();
}

/** The task.sh arguments, as edit.sh reads them: one per line. */
function argumentsOf(caseName: string): { verb: string; id: string; reason: string; replacement?: string | undefined; yes: boolean } {
  const lines = readFileSync(join(EDITS, caseName, 'args'), 'utf8')
    .replace(/\n$/, '')
    .split('\n');
  const r = { verb: lines[0] ?? '', id: lines[1] ?? '', reason: '', replacement: undefined as string | undefined, yes: false };
  for (let i = 2; i < lines.length; i++) {
    if (lines[i] === '--reason') r.reason = lines[++i] ?? '';
    else if (lines[i] === '--replaced-by') r.replacement = lines[++i];
    else if (lines[i] === '--yes') r.yes = true;
    // task.sh refuses an option it does not know with the usage; a case with one would run differently here.
    else if (lines[i] !== '--json') throw new Error(`${caseName}: argument ${lines[i]} that this runner does not read`);
  }
  return r;
}

const allEditCases = readdirSync(EDITS, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();
// claim, close and release are task.sh verbs that core/ does not implement: their cases run only against the shell.
const SHELL_ONLY_VERBS = ['claim', 'close', 'release'];
const editCases = allEditCases.filter((c) => !SHELL_ONLY_VERBS.includes(argumentsOf(c).verb));

describe('edit conformance (core/contract/conformance/edits)', () => {
  it('finds the forty-seven cases, skips the thirteen of claim, close and release, and has the texts of the others in the table', () => {
    expect(allEditCases).toHaveLength(47);
    expect(allEditCases.length - editCases.length).toBe(13);
    expect(Object.keys(X_TEST_TABLE)).toHaveLength(15);
  });

  // The «Texts» table of edits/README.md has to match core/i18n: pt-BR, en and x-test, key by key.
  it('the text table matches core/i18n', () => {
    const I18N = resolve(import.meta.dirname, '..', '..', 'i18n');
    const language = (l: string) => JSON.parse(readFileSync(join(I18N, `${l}.json`), 'utf8')) as Record<string, string>;
    const ptBR = language('pt-BR');
    const en = language('en');
    const xTest = language('x-test');
    const rows = [
      ...readFileSync(join(EDITS, 'README.md'), 'utf8').matchAll(/^\| `(task\.[A-Za-z]+)` \| `([^`]*)` \| `([^`]*)` \| `([^`]*)` \|$/gm),
    ];
    expect(rows).toHaveLength(15);
    for (const [, key = '', pt, eng, xt] of rows) {
      expect(ptBR[key], `${key} pt-BR`).toBe(pt);
      expect(en[key], `${key} en`).toBe(eng);
      expect(xTest[key], `${key} x-test`).toBe(xt);
    }
  });

  it.each(editCases)('%s', async (caseName) => {
    const dir = join(EDITS, caseName);
    const [name = ''] = readdirSync(join(dir, 'before', 'agent_plans'));
    const before = join(dir, 'before', 'agent_plans', name);
    const status = await readStatus(nodeFiles, before);
    if ('error' in status) throw new Error(JSON.stringify(status.error));
    const texts = new Map(status.tasks.map((t) => [t.file, readFileSync(join(before, t.file), 'utf8')]));
    const a = argumentsOf(caseName);
    // The log lines go in the plan's language, picked as a host picks it (stringsFor); x-test is the tests' own table.
    const write: Write = status.language === 'x-test' ? writeXTest : stringsFor(status.language).t;

    let result;
    if (a.verb === 'cancel') result = cancel(status.tasks, texts, a.id, { replacement: a.replacement, reason: a.reason }, write);
    else if (a.verb === 'giveup' && a.yes) result = giveUp(status.tasks, texts, a.id, a.reason, write);
    else if (a.verb === 'giveup') result = giveUpClosure(status.tasks, a.id);
    else if (a.verb === 'reopen') result = reopen(status.tasks, texts, a.id, write);
    else throw new Error(`unknown verb: ${a.verb}`);

    const exit = readFileSync(join(dir, 'exit'), 'utf8').trim();
    if ('refusal' in result) {
      expect(exit).toBe('1');
      if (result.refusal.key === 'task.notFound') {
        // The shell adds the path of the plan folder, which a pure function cannot know: compare the key and the id.
        expect(readFileSync(join(dir, 'stderr'), 'utf8')).toMatch(new RegExp(`^x-test:task\\.notFound ${a.id}( |\\n|$)`));
        return;
      }
      expect(render(result.refusal)).toBe(readFileSync(join(dir, 'stderr'), 'utf8').replace(/\n$/, ''));
      return;
    }
    expect(exit).toBe('0');
    if ('root' in result) {
      expect(result).toStrictEqual(JSON.parse(readFileSync(join(dir, 'preview.json'), 'utf8')));
      return;
    }
    const after = join(dir, 'after', 'agent_plans', name);
    expect(tree(before)).toStrictEqual(tree(after));
    // A file the verb writes that the expected tree does not have would be a leftover, not a change.
    for (const file of result.files.keys()) expect(tree(after), file).toContain(file);
    for (const file of tree(before)) {
      const got = result.files.get(file) ?? readFileSync(join(before, file), 'utf8');
      expect(got, file).toBe(readFileSync(join(after, file), 'utf8'));
    }
  });

  it.skip.each(allEditCases.filter((c) => !editCases.includes(c)))('%s (shell only: core/ has no claim, close or release)', () => {});
});

describe('reason conformance (core/contract/conformance/reasons.json)', () => {
  const { reasons } = JSON.parse(readFileSync(join(CONFORMANCE, 'reasons.json'), 'utf8')) as {
    reasons: { input: string; valid: boolean; written?: string }[];
  };
  const only = 'Status: ready\nType: code\n\n# F1-01 - Only\n\n## Log\n';
  const taskFile = 'phase-1-a/F1-01-only.md';
  const tasks = [{ id: 'F1-01', title: 'Only', status: 'ready', blocked_by: [], file: taskFile }];

  // The whole file, as edit.sh compares it: a valid reason changes the status and adds the log line,
  // and nothing else.
  const cancelled = (written: string) =>
    `Status: cancelled\nType: code\n\n# F1-01 - Only\n\n## Log\n\n- x-test:task.logCancel ${written}\n`;

  it.each(reasons.map((r) => [JSON.stringify(r.input), r] as const))('%s', (_name, r) => {
    expect(isValidReason(r.input)).toBe(r.valid);
    const c = cancel(tasks, new Map([[taskFile, only]]), 'F1-01', { reason: r.input }, writeXTest);
    if (r.valid) {
      expect(normalizeReason(r.input)).toBe(r.written);
      if ('refusal' in c) throw new Error(JSON.stringify(c.refusal));
      expect([...c.files.keys()]).toStrictEqual([taskFile]);
      expect(c.files.get(taskFile)).toBe(cancelled(r.written ?? ''));
    } else {
      // A refusal writes no file: the strict match fails if the result carries a files key at all.
      expect(c).toStrictEqual({ refusal: { key: 'task.invalidReason', args: [] } });
    }
  });
});

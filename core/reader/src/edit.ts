// The new text of the tasks on cancel, give up and reopen (core/contract/contract.md, «What the verbs
// write»): pure functions that receive the text of each file and return the new text of those that change,
// byte for byte like task.sh. Nothing here reads or writes a file: the host reads the texts, calls the function and
// writes the result (each file through a temporary and a rename). The refusals come from give-up.ts,
// all before any new text.
import { giveUpClosure, reopenClosure, isValidReason, normalizeReason, cancelRefusal, type Refusal, type GraphTask } from './give-up';

/** The keys of the `## Log` lines (core/i18n, area `task.`). */
export type LogKey =
  'task.logCancel' | 'task.logCancelReplaced' | 'task.logGiveup' | 'task.logGiveupWith' | 'task.logReopen' | 'task.logReopenWith';

/** The text of a `## Log` line in the language of the plan (`language` of plan.json), with `{n}` replaced. */
export type Write = (key: LogKey, ...args: string[]) => string;

/** The text of each task, by path relative to the plan folder (the `file` of the status). */
export type TaskTexts = ReadonlyMap<string, string>;

/** The files that change, with the new text, or the refusal (and then nothing changes). */
export type EditResult = { files: Map<string, string> } | { refusal: Refusal };

const VERB_KEYS = /^(Replaced by|Given up by|Given up with|Previous status):/;
const BLANK = /^[ \t]*$/;

/**
 * The rewritten header: the `Status:` line (the last one in the header, the one the reader keeps)
 * becomes `Status: <status>` where it was, the other `Replaced by:`, `Given up by:`, `Given up with:`
 * and `Previous status:` header lines go away, and `lines` enter right after the `Status:` line. The
 * rest, blank lines included, stays where it was. Without a `Status:` line (the verbs refuse such a
 * task first), the new one goes on line 1.
 */
export function rewriteHeader(text: string, status: string, lines: readonly string[]): string {
  const all = text.split('\n');
  let title = all.findIndex((l) => l.startsWith('# '));
  if (title < 0) title = all.length;
  let at = -1;
  for (let i = 0; i < title; i++) if ((all[i] ?? '').startsWith('Status:')) at = i;
  const out: string[] = [];
  if (at < 0) out.push(`Status: ${status}`, ...lines);
  all.forEach((l, i) => {
    if (i === at) out.push(`Status: ${status}`, ...lines);
    else if (i >= title || !VERB_KEYS.test(l)) out.push(l);
  });
  return out.join('\n');
}

/**
 * Appends `- <entry>` to the `## Log` section (the first line equal to `## Log` below the title, up to
 * the next one that starts with `# ` or `## `): right after its last non-empty line, or, with the section
 * empty, after `## Log` and a blank line. Without the section, the blank lines at the end are removed
 * and a blank one, `## Log`, another blank one and the entry go in. The file ends with a line break.
 */
export function appendToLog(text: string, entry: string): string {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const line = `- ${entry}`;
  const title = lines.findIndex((l) => l.startsWith('# '));
  const start = lines.findIndex((l, i) => i > title && l === '## Log');
  if (start < 0) {
    while (lines.length > 0 && BLANK.test(lines[lines.length - 1] ?? '')) lines.pop();
    lines.push('', '## Log', '', line);
  } else {
    let end = start + 1;
    while (end < lines.length && !(lines[end] ?? '').startsWith('# ') && !(lines[end] ?? '').startsWith('## ')) end++;
    let last = end - 1;
    while (last > start && BLANK.test(lines[last] ?? '')) last--;
    if (last === start) lines.splice(start + 1, 0, '', line);
    else lines.splice(last + 1, 0, line);
  }
  return lines.join('\n') + '\n';
}

/** The value of a header key (the last occurrence, as the reader keeps it), or `undefined`. */
function headerValue(text: string, key: string): string | undefined {
  let value: string | undefined;
  for (const raw of text.split('\n')) {
    const l = raw.replace(/\r$/, '');
    if (l.startsWith('# ')) break;
    if (l.startsWith(`${key}:`)) value = l.slice(key.length + 1).replace(/^[ \t]*/, '');
  }
  return value;
}

function textOf(texts: TaskTexts, t: GraphTask): string {
  const x = texts.get(t.file);
  if (x === undefined) throw new Error(`edit: ${t.file}`); // the host did not pass the text of this task
  return x;
}

/**
 * The header rewritten and the log line added. Lines are compared without a CR at the end, and the whole
 * file is written with the line ending of its first line: a task saved with CRLF stays CRLF, new lines included.
 */
function change(text: string, status: string, lines: readonly string[], entry: string): string {
  const crlf = (text.split('\n')[0] ?? '').endsWith('\r');
  const lf = appendToLog(rewriteHeader(text.replace(/\r$/gm, ''), status, lines), entry);
  return crlf ? lf.replace(/\n/g, '\r\n') : lf;
}

/** `task.sh cancel <id> [--replaced-by <replacement>] --reason <reason>`. The agent's: the panel does not cancel. */
export function cancel(
  tasks: readonly GraphTask[],
  texts: TaskTexts,
  id: string,
  o: { replacement?: string | undefined; reason: string },
  write: Write,
): EditResult {
  const refusal = cancelRefusal(tasks, id, o.replacement, o.reason);
  if (refusal) return { refusal };
  const task = tasks.find((t) => t.id === id) as GraphTask;
  const reason = normalizeReason(o.reason);
  const updated =
    o.replacement === undefined
      ? change(textOf(texts, task), 'cancelled', [], write('task.logCancel', reason))
      : change(textOf(texts, task), 'cancelled', [`Replaced by: ${o.replacement}`], write('task.logCancelReplaced', o.replacement, reason));
  return { files: new Map([[task.file, updated]]) };
}

/** `task.sh giveup <id> --reason <reason> --yes`: the root and the closure become `abandoned`. The preview is `giveUpClosure`. */
export function giveUp(tasks: readonly GraphTask[], texts: TaskTexts, id: string, reason: string, write: Write): EditResult {
  const preview = giveUpClosure(tasks, id);
  if ('refusal' in preview) return preview;
  if (!isValidReason(reason)) return { refusal: { key: 'task.invalidReason', args: [] } };
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const files = new Map<string, string>();
  for (const q of preview.falls) {
    const t = byId.get(q.id) as GraphTask;
    const lines = q.parent === null ? ['Given up by: owner'] : [`Given up with: ${id}`];
    if (t.status === 'draft') lines.push('Previous status: draft');
    const entry = q.parent === null ? write('task.logGiveup', normalizeReason(reason)) : write('task.logGiveupWith', id);
    files.set(t.file, change(textOf(texts, t), 'abandoned', lines, entry));
  }
  return { files: files };
}

/** `task.sh reopen <id>`: the root and those that fell with it go back to `Previous status:` (draft) or to ready. */
export function reopen(tasks: readonly GraphTask[], texts: TaskTexts, id: string, write: Write): EditResult {
  const back = reopenClosure(tasks, id);
  if ('refusal' in back) return back;
  const files = new Map<string, string>();
  for (const t of back) {
    const text = textOf(texts, t);
    const status = headerValue(text, 'Previous status') === 'draft' ? 'draft' : 'ready';
    const entry = t.id === id ? write('task.logReopen') : write('task.logReopenWith', id);
    files.set(t.file, change(text, status, [], entry));
  }
  return { files: files };
}

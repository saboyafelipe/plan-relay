// The answers given in advance to the card commands. No `import` of `vscode` values, so the test can
// run outside the editor; the mode is the `ExtensionContext.extensionMode` that `activate` receives.
import type * as vscode from 'vscode';

/**
 * Answers given in advance to `planRelay.map`, `deletePlan`, `runTask`, `runPlan`, `giveUpTask` and `reopenTask`
 * (optional argument): they skip the modal, the reason box and the install question. They serve the extension's
 * tests; the menu and the panel do not pass them.
 */
export interface CannedAnswers {
  /** The modal option's identifier (`ModalOption` in `actions/modal.ts`, such as `'delete'`), not the label; `null` is "Cancel". */
  answer?: string | null | undefined;
  /** The reason for giving up, as if typed in the box; `null` is Esc. */
  reason?: string | null;
  /** Install the plugin, if missing, in this scope; `false` declines. */
  install?: 'project' | 'user' | false | undefined;
}

/** `vscode.ExtensionMode.Development` and `Test` (the test checks the numbers in `vscode.d.ts`). */
const MODES_WITH_ANSWERS: readonly number[] = [2, 3];

/**
 * The argument's answers, only in `Development` or `Test`: installed from the `.vsix` or the store, the extension
 * ignores the argument, and another extension calling `planRelay.deletePlan` with `{answer: 'delete'}` lands on the modal.
 */
export function answersOf(x: unknown, mode: vscode.ExtensionMode): CannedAnswers | undefined {
  if (!MODES_WITH_ANSWERS.includes(mode)) return undefined;
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return undefined;
  const r = x as Record<string, unknown>;
  const answer = typeof r.answer === 'string' || r.answer === null ? r.answer : undefined;
  const install = r.install === 'project' || r.install === 'user' || r.install === false ? r.install : undefined;
  const reason = typeof r.reason === 'string' || r.reason === null ? r.reason : undefined;
  return { answer, install, ...(reason !== undefined ? { reason } : {}) };
}

// Opens a plan's files at the webview's request, never leaving the plan folder.
import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type * as vscode from 'vscode';

/** `target` is strictly inside `base` (both absolute and already resolved). */
export function strictlyInside(base: string, target: string): boolean {
  const rel = relative(base, target);
  return rel !== '' && !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
}

/**
 * Absolute path of `file` inside `planDir`, or `undefined` when the result is not strictly
 * inside it (`..`, absolute paths, the folder itself, null bytes). Only the text of the path: links are not followed.
 */
export function resolveInside(planDir: string, file: string): string | undefined {
  if (file === '' || file.includes('\0') || isAbsolute(file)) return undefined;
  const base = resolve(planDir);
  const target = resolve(base, file);
  return strictlyInside(base, target) ? target : undefined;
}

/**
 * The path of `file` inside `planDir`, checked twice: `resolveInside` on the text, then the same comparison between the
 * real paths, so a link inside the plan that points outside it is refused. Gives the path as written (what the editor
 * shows), not the real one. Rejects when the file cannot be resolved (it does not exist, no permission): the caller
 * reports that it could not open it.
 */
export async function resolveReal(planDir: string, file: string): Promise<string | undefined> {
  const lexical = resolveInside(planDir, file);
  if (lexical === undefined) return undefined;
  const [base, target] = await realPaths(planDir, lexical);
  return strictlyInside(base, target) ? lexical : undefined;
}

/**
 * The real paths of `base` and `target` (links resolved), for a containment check after the lexical one. Rejects
 * when either cannot be resolved. `resolveLink` is `realpath` unless a test simulates the file system.
 */
export function realPaths(
  base: string,
  target: string,
  resolveLink: (path: string) => Promise<string> = realpath,
): Promise<[string, string]> {
  return Promise.all([resolveLink(base), resolveLink(target)]);
}

/** Opens the plan's `file` in the editor; returns `false` when the path is refused. */
export async function openInPlan(window: typeof vscode.window, uri: typeof vscode.Uri, planDir: string, file: string): Promise<boolean> {
  const path = await resolveReal(planDir, file);
  if (path === undefined) return false;
  await window.showTextDocument(uri.file(path), { preview: true });
  return true;
}

// Delete a plan: the `<root>/agent_plans/<name>/` folder, moved to the trash. Nothing outside it is deleted. There is
// no per-plan entry skill any more: the plan is just the folder.
import { realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type * as vscode from 'vscode';
import { stringsFor, type Strings } from '@plan-relay/i18n';
import { realPaths, resolveInside } from '../open';
import { errorMessage } from '../util';

export interface DeleteFs {
  exists(path: string): Promise<boolean>;
  /** The path with every link resolved; rejects when it cannot be resolved. */
  realpath(path: string): Promise<string>;
  /** Deletes recursively, to the trash. */
  remove(path: string): Promise<void>;
}

export type DeleteResult = { ok: true; deleted: string[] } | { ok: false; error: string; deleted: string[] };

/** Deletes the plan at `planDir`, which must be a direct child folder of `<root>/agent_plans/`. */
export async function deletePlan(root: string, planDir: string, fs: DeleteFs, strings: Strings = stringsFor()): Promise<DeleteResult> {
  const { t } = strings;
  const refusal = (error: string): DeleteResult => ({ ok: false, error, deleted: [] });
  const name = basename(planDir);
  const base = join(resolve(root), 'agent_plans');
  const folder = resolveInside(base, name);
  if (planDir.includes('\0') || folder === undefined || folder !== resolve(planDir) || dirname(folder) !== base) {
    return refusal(t('delete.refused', planDir, base));
  }
  if (!(await fs.exists(folder))) return refusal(t('delete.notFound', folder));
  // The same check on the real paths: a plan folder that is a link leading out of `agent_plans/` is refused.
  let real: [string, string];
  try {
    real = await realPaths(base, folder, (path) => fs.realpath(path));
  } catch (e) {
    return refusal(t('delete.failed', folder, errorMessage(e)));
  }
  if (dirname(real[1]) !== real[0]) return refusal(t('delete.refused', planDir, base));
  try {
    await fs.remove(folder);
  } catch (e) {
    return { ok: false, error: t('delete.failed', folder, errorMessage(e)), deleted: [] };
  }
  return { ok: true, deleted: [folder] };
}

/** The real `fs`: `workspace.fs`, with `useTrash`. */
export function vscodeFs(api: typeof vscode): DeleteFs {
  return {
    exists: async (path) => {
      try {
        await api.workspace.fs.stat(api.Uri.file(path));
        return true;
      } catch {
        return false;
      }
    },
    realpath: (path) => realpath(path),
    remove: async (path) => {
      await api.workspace.fs.delete(api.Uri.file(path), { recursive: true, useTrash: true });
    },
  };
}

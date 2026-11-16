// `Files` and the dependencies of the environment checks on top of Node, for hosts that run on it (the
// extension, the tests). Read-only: nothing here executes a file, from the workspace or from the PATH.
import { accessSync, constants, statSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { release } from 'node:os';
import { join } from 'node:path';
import type { EnvironmentDeps } from './environment';
import type { Files } from './files';

function isExecutable(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    if (process.platform !== 'win32') accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** The PATH and PATHEXT of `env` (the process one by default; a test builds its own), the platform and the Node system. */
export function nodeEnvironment(env: NodeJS.ProcessEnv = process.env): EnvironmentDeps {
  return {
    path: env.PATH ?? env.Path,
    platform: process.platform,
    systemVersion: release(),
    pathext: env.PATHEXT,
    executable: isExecutable,
  };
}

function isMissing(e: unknown): boolean {
  const code = (e as NodeJS.ErrnoException)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

export const nodeFiles: Files = {
  async list(folder) {
    try {
      const entries = await readdir(folder, { withFileTypes: true });
      return entries.map((e) => ({ name: e.name, directory: e.isDirectory() }));
    } catch (e) {
      if (isMissing(e)) return undefined;
      throw e;
    }
  },
  async read(file) {
    try {
      return await readFile(file, 'utf8');
    } catch (e) {
      if (isMissing(e)) return undefined;
      throw e;
    }
  },
  join: (...parts) => join(...parts),
};

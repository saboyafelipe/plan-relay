// The plugin copy in the cache against the source folder. In a folder marketplace the CLI reads the
// source, but the Agents window reads the copy, written only at install time. The same rule as check-agent.sh:
// the list of files (without links) and the bytes of each one.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

async function files(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(root, join(e.parentPath, e.name)))
    .sort();
}

/** `true` equal, `false` different (or the cache is gone), `undefined` when the source is unreadable. */
export async function sameFolders(origin: string, cache: string): Promise<boolean | undefined> {
  let fromOrigin: string[];
  try {
    fromOrigin = await files(origin);
  } catch {
    return undefined;
  }
  let fromCache: string[];
  try {
    fromCache = await files(cache);
  } catch {
    return false;
  }
  if (fromOrigin.length !== fromCache.length || fromOrigin.some((a, i) => a !== fromCache[i])) return false;
  for (const file of fromOrigin) {
    const [a, b] = await Promise.all([readFile(join(origin, file)), readFile(join(cache, file))]);
    if (!a.equals(b)) return false;
  }
  return true;
}

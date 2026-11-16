// The installed extension against the one in the open repository: when the folder is a clone of this repository
// (its `hosts/vscode/package.json` has the same publisher and name as the running extension) and the version there
// differs, the panel shows a notice at the top, with both versions and how to reinstall. It does not cover a
// `.vsix` rebuilt without bumping the version.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringsFor, type Strings } from '@plan-relay/i18n';

/** What is compared from the `package.json`: the running extension's (`context.extension.packageJSON`). */
export interface ExtensionIdentity {
  publisher: string;
  name: string;
  version: string;
}

/** The notice text, or `undefined` when there is nothing to warn about. Does not reject. */
export async function outdatedExtensionNotice(
  folder: string | undefined,
  own: ExtensionIdentity,
  strings: Strings = stringsFor(),
): Promise<string | undefined> {
  if (folder === undefined) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(await readFile(join(folder, 'hosts', 'vscode', 'package.json'), 'utf8'));
  } catch {
    return undefined;
  }
  if (typeof data !== 'object' || data === null) return undefined;
  const { publisher, name, version } = data as Record<string, unknown>;
  if (publisher !== own.publisher || name !== own.name) return undefined;
  if (typeof version !== 'string' || version === own.version) return undefined;
  return strings.t('extension.outdated', own.version, version);
}

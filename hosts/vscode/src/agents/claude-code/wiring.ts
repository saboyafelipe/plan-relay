// The real dependencies for reading and installing the plugin: the chosen binary, the process,
// the file system. The `plugin-state` and `install` modules stay pure and are tested separately.
import { existsSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type * as vscode from 'vscode';
import { stringsFor, type Strings } from '@plan-relay/i18n';
import { findOnPath } from '@plan-relay/reader';
import { nodeEnvironment } from '@plan-relay/reader/node';
import { runProcess } from '../../process';
import type { AgentEnvironmentDeps } from './environment';
import { claudeBinary, type Binary } from './binary';
import { sameFolders } from './copy';
import type { PluginStateDeps } from './plugin-state';
import type { InstallDeps } from './install';

import { CLAUDE_EXTENSION } from './open';
/** `plugin list` takes ~1 s; installing may have to copy the plugin into the cache. */
const LIST_TIMEOUT_MS = 15_000;
const INSTALL_TIMEOUT_MS = 60_000;

export function configuredBinary(api: typeof vscode): Binary {
  return claudeBinary({
    configured: api.workspace.getConfiguration('planRelay').get<string>('claudePath', ''),
    officialFolder: api.extensions.getExtension(CLAUDE_EXTENSION)?.extensionPath,
    exists: existsSync,
    windows: process.platform === 'win32',
  });
}

function runWith(binary: Binary, timeoutMs: number, strings: Strings): PluginStateDeps['runCommand'] {
  return (args, cwd) => runProcess(binary.path, args, { cwd, timeoutMs, name: `claude ${args.slice(0, 2).join(' ')}`, strings });
}

export function pluginStateDeps(binary: Binary, strings: Strings = stringsFor()): PluginStateDeps {
  return { runCommand: runWith(binary, LIST_TIMEOUT_MS, strings), realPath: realpathSync, strings };
}

/** The environment checks: the extension process's PATH and the same timeout as the plugin list. */
export function environmentDeps(binary: Binary, strings: Strings = stringsFor()): AgentEnvironmentDeps {
  const node = nodeEnvironment();
  return {
    binary,
    search: (name) => findOnPath(name, node),
    executable: node.executable,
    runCommand: runWith(binary, LIST_TIMEOUT_MS, strings),
    sameFolders,
    strings,
  };
}

export function installDeps(binary: Binary, channel: InstallDeps['channel'], strings: Strings = stringsFor()): InstallDeps {
  return {
    runCommand: runWith(binary, INSTALL_TIMEOUT_MS, strings),
    readFileText: async (path) => {
      try {
        return await readFile(path, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
      }
    },
    channel,
    strings,
  };
}

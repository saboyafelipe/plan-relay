// Which Claude Code binary runs the `plugin …` commands: the configured one, the official extension's native
// one (the same version the user has in VS Code) or the `claude` on the PATH.
import { join } from 'node:path';

export interface BinaryDeps {
  /** `planRelay.claudePath`; empty or only spaces = not configured. */
  configured: string;
  /** `extensionPath` of `anthropic.claude-code`, when installed. */
  officialFolder: string | undefined;
  exists(path: string): boolean;
  windows: boolean;
}

export interface Binary {
  path: string;
  origin: 'setting' | 'official-extension' | 'path';
}

export function claudeBinary(deps: BinaryDeps): Binary {
  const configured = deps.configured.trim();
  if (configured) return { path: configured, origin: 'setting' };
  if (deps.officialFolder !== undefined) {
    const nativePath = join(deps.officialFolder, 'resources', 'native-binary', deps.windows ? 'claude.exe' : 'claude');
    if (deps.exists(nativePath)) return { path: nativePath, origin: 'official-extension' };
  }
  return { path: 'claude', origin: 'path' };
}

// The general environment checks (jq, git, os, shell) in TypeScript, in the shape of `check.sh --json`
// (core/contract/schema/check.schema.json), so that the panel can run them without running sh. The ids, the
// order and the `required` flags are those of core/scripts/check.sh; a test of the extension compares them with the script. The PATH,
// the platform and the executable test come from outside (`node.ts` gives the Node ones). The `detail` comes from core/i18n.
import { stringsFor, type Strings } from '@plan-relay/i18n';

export type CheckStatus = 'ok' | 'missing' | 'warning' | 'unknown';

export interface Check {
  id: string;
  status: CheckStatus;
  required: boolean;
  /** Text for people; on missing/warning it says how to fix it. */
  detail: string;
}

/** The object of `check.sh --json`. */
export interface Environment {
  ok: boolean;
  checks: Check[];
}

export interface EnvironmentDeps {
  /** The process PATH. */
  path: string | undefined;
  /** `process.platform`. */
  platform: string;
  /** `os.release()`, to recognize WSL. */
  systemVersion: string;
  /** The PATHEXT, on Windows. */
  pathext?: string | undefined;
  /** The path is an executable file. */
  executable: (path: string) => boolean;
  /** The language of the `detail` (English without it). */
  strings?: Strings;
}

const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

/** The first executable `name` in the PATH folders (on Windows, with the PATHEXT extensions). */
export function findOnPath(name: string, deps: Pick<EnvironmentDeps, 'path' | 'platform' | 'pathext' | 'executable'>): string | undefined {
  const windows = deps.platform === 'win32';
  const extensions = windows ? (deps.pathext || DEFAULT_PATHEXT).split(';').filter(Boolean) : [''];
  const slash = windows ? '\\' : '/';
  for (const folder of (deps.path ?? '').split(windows ? ';' : ':')) {
    if (!folder) continue;
    const base = folder.replace(/[\\/]+$/, '');
    for (const extension of extensions) {
      const path = `${base}${slash}${name}${extension}`;
      if (deps.executable(path)) return path;
    }
  }
  return undefined;
}

/** The system name as the check.sh `uname -s` gives it. */
function systemName(platform: string, version: string): string {
  switch (platform) {
    case 'darwin':
      return 'Darwin';
    case 'linux':
      return /microsoft/i.test(version) ? 'Linux (WSL)' : 'Linux';
    case 'win32':
      return 'Windows';
    default:
      return platform;
  }
}

/** jq (required), git, os and shell, in this order. */
export function generalChecks(deps: EnvironmentDeps): Check[] {
  const { t } = deps.strings ?? stringsFor();
  const find = (name: string) => findOnPath(name, deps);
  const jq = find('jq');
  const git = find('git');
  const windows = deps.platform === 'win32';
  const sh = find('sh') ?? (windows ? find('bash') : undefined);
  const shell: Check = sh
    ? { id: 'shell', status: 'ok', required: false, detail: t(windows ? 'environment.shellWindows' : 'environment.shellPosix', sh) }
    : {
        id: 'shell',
        status: 'missing',
        required: false,
        detail: t(windows ? 'environment.shellMissingWindows' : 'environment.shellMissing'),
      };
  return [
    jq
      ? { id: 'jq', status: 'ok', required: true, detail: jq }
      : { id: 'jq', status: 'missing', required: true, detail: t('environment.jqMissing') },
    git
      ? { id: 'git', status: 'ok', required: false, detail: git }
      : { id: 'git', status: 'missing', required: false, detail: t('environment.gitMissing') },
    { id: 'os', status: 'ok', required: false, detail: systemName(deps.platform, deps.systemVersion) },
    shell,
  ];
}

/** The object of `check.sh --json`: `ok` when no required check has a status other than ok. */
export function environmentOf(checks: Check[]): Environment {
  return { ok: !checks.some((c) => c.required && c.status !== 'ok'), checks };
}

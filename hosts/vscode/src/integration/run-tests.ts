// The extension's integration test: opens a real VS Code, at the minimum `engines.vscode` version, with the
// extension in development and a copy of fixtures/demo-project as the workspace, and runs suite.ts inside it.
// Run it with `npm run test:integration` (on headless Linux, under `xvfb-run`).
//
// The agent is simulated without changing the extension: `planRelay.claudePath`, in the user settings of the test's
// own user data folder, points to a fake `claude`, which says the plugin is active, and the suite registers the official Claude Code extension's command, which is not installed
// here.
//
// Two rounds, on the same downloaded VS Code: the example as it is, and the example in a `git init` with
// `agent_plans/` in `.gitignore`, as in a project that keeps the plan out of git. A `workspaceContains` glob
// search respects the ignore files; the extension must activate in both cases.
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runTests } from '@vscode/test-electron';
import { PLUGIN_ID } from '../agents/claude-code/plugin-state';

/** The VS Code version for the test: the minimum of `engines.vscode` (`^1.146.0` → `1.146.0`). */
function minimumVersion(extension: string): string {
  const manifest = JSON.parse(readFileSync(join(extension, 'package.json'), 'utf8')) as { engines: { vscode: string } };
  const versionText = /^\^(\d+\.\d+\.\d+)$/.exec(manifest.engines.vscode)?.[1];
  if (!versionText) throw new Error(`engines.vscode is not in the form ^X.Y.Z: ${manifest.engines.vscode}`);
  return versionText;
}

/** A `claude` that only knows how to answer `plugin list --json`: the plugin active for the user. */
const FAKE_CLAUDE = `#!/bin/sh
if [ "$1 $2" = "plugin list" ]; then
  printf '%s\\n' '${JSON.stringify([{ id: PLUGIN_ID, scope: 'user', enabled: true }])}'
  exit 0
fi
echo "fake claude of the integration test: $*" >&2
exit 1
`;

interface Round {
  /** Name of the workspace folder and of the round in the report. */
  name: string;
  /** `git init` and `agent_plans/` in `.gitignore`. */
  gitignore: boolean;
}

const ROUNDS: Round[] = [
  { name: 'demo-project', gitignore: false },
  { name: 'demo-project-gitignore', gitignore: true },
];

/**
 * User settings in `userData` that point `planRelay.claudePath` at the fake `claude`. The setting is machine-scoped,
 * so VS Code ignores it in a workspace's `.vscode/settings.json`.
 */
function prepareUserData(userData: string, claude: string): void {
  mkdirSync(join(userData, 'User'));
  writeFileSync(join(userData, 'User', 'settings.json'), JSON.stringify({ 'planRelay.claudePath': claude }, null, 2));
}

/** A copy of the example's agent_plans/ in `<root>/<name>`. */
function prepareWorkspace(example: string, root: string, round: Round): string {
  const workspace = join(root, round.name);
  cpSync(join(example, 'agent_plans'), join(workspace, 'agent_plans'), { recursive: true });
  if (round.gitignore) {
    // The search's ripgrep only reads .gitignore inside a git repository.
    execFileSync('git', ['init', '-q'], { cwd: workspace });
    writeFileSync(join(workspace, '.gitignore'), 'agent_plans/\n');
  }
  return workspace;
}

async function main(): Promise<void> {
  // Compiled to out/integration/run-tests.js: the extension is two folders up.
  const extension = resolve(__dirname, '..', '..');
  const example = resolve(extension, '..', '..', 'fixtures', 'demo-project');
  // The real path: on macOS the tmpdir is a link (/var → /private/var), and the panel compares paths.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'plan-relay-integration-')));
  const claude = join(root, 'claude');
  // A folder of its own with a short name: VS Code puts its IPC socket in it, and a socket path longer than 103
  // characters (easy under the macOS tmpdir) draws a warning.
  const userData = mkdtempSync(join(tmpdir(), 'prud-'));
  // Run from a VS Code terminal (or from an extension), the process inherits this variable, and the test's VS Code
  // would start as Node and take the workspace for a script.
  delete process.env.ELECTRON_RUN_AS_NODE;
  try {
    writeFileSync(claude, FAKE_CLAUDE);
    chmodSync(claude, 0o755);
    prepareUserData(userData, claude);
    for (const round of ROUNDS) {
      const workspace = prepareWorkspace(example, root, round);
      const started = Date.now();
      console.log(`round ${round.name}`);
      await runTests({
        version: minimumVersion(extension),
        extensionDevelopmentPath: extension,
        extensionTestsPath: join(__dirname, 'suite.js'),
        launchArgs: [workspace, '--disable-extensions', `--user-data-dir=${userData}`],
        extensionTestsEnv: { PLAN_RELAY_INTEGRATION_WORKSPACE: workspace },
      });
      console.log(`round ${round.name}: ${Math.round((Date.now() - started) / 1000)} s`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

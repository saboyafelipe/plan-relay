import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProcessError, ProcessOutput } from '../../process';
import { findMarketplace, uninstall, DEFAULT_SOURCE, install, type InstallDeps } from './install';

const FOLDER = '/private/tmp/ap42u';
const MK = '/home/dev/plan-relay';
const OK_INSTALL =
  '{"command":"install","outcome":"ok","pluginId":"plan-relay@plan-relay","message":"Successfully installed plugin: plan-relay@plan-relay (scope: user)"}\n';
const OK_UNINSTALL = '{"command":"uninstall","outcome":"ok","message":"Successfully uninstalled plugin: plan-relay (scope: user)"}\n';
const OK_MK =
  '{"command":"marketplace-add","outcome":"ok","marketplace":"plan-relay","message":"Marketplace \'plan-relay\' already on disk — declared in project settings"}\n';

function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');
}

/** A simulated process: answers by argument prefix; records the calls. There is no way to write or delete. */
function fake(
  answers: Record<string, ProcessOutput | ProcessError | Array<ProcessOutput | ProcessError>>,
  files: Record<string, string> = {},
) {
  const calls: string[] = [];
  const lines: string[] = [];
  const deps: InstallDeps = {
    runCommand: async (args, cwd) => {
      const cmd = args.join(' ');
      calls.push(`${cmd} @${cwd}`);
      const key = Object.keys(answers).find((k) => cmd.startsWith(k));
      if (!key) return { error: `inesperado: ${cmd}` };
      const r = answers[key];
      if (r === undefined) return { error: `inesperado: ${cmd}` };
      return Array.isArray(r) ? (r.shift() ?? { error: 'sem mais respostas' }) : r;
    },
    readFileText: async (c) => files[c],
    channel: { info: (t) => lines.push(t), warn: (t) => lines.push(`warn ${t}`) },
  };
  return { deps, calls, lines };
}

const ok = (stdout: string): ProcessOutput => ({ stdout, stderr: '' });

describe('findMarketplace', () => {
  it('the configuration wins: a folder', async () => {
    const { deps } = fake({});
    expect(await findMarketplace(FOLDER, ' /mk ', deps)).toEqual({ source: '/mk', origin: 'configured' });
  });

  it('the configuration wins: a git repository', async () => {
    const { deps, calls } = fake({}, { [`${FOLDER}/.claude-plugin/marketplace.json`]: '{"name":"plan-relay"}' });
    expect(await findMarketplace(FOLDER, 'alguem/plan-relay', deps)).toEqual({ source: 'alguem/plan-relay', origin: 'configured' });
    expect(calls).toEqual([]);
  });

  it('otherwise the folder itself, when it is the plan-relay repository', async () => {
    const { deps } = fake({}, { [`${FOLDER}/.claude-plugin/marketplace.json`]: '{"name":"plan-relay"}' });
    expect(await findMarketplace(FOLDER, '', deps)).toEqual({ source: FOLDER, origin: 'workspace' });
  });

  it('ignores a marketplace with another name in the folder and falls back to the default git source', async () => {
    const { deps } = fake(
      { 'plugin marketplace list --json': ok('[]') },
      { [`${FOLDER}/.claude-plugin/marketplace.json`]: '{"name":"outro-marketplace"}' },
    );
    expect(await findMarketplace(FOLDER, '', deps)).toEqual({ source: DEFAULT_SOURCE, origin: 'default' });
  });

  it('otherwise the plan-relay marketplace the CLI already knows, from a folder', async () => {
    const list = JSON.stringify([
      { name: 'plan-relay', source: 'diretory', path: MK },
      { name: 'outro', source: 'github' },
    ]);
    const { deps, calls } = fake({ 'plugin marketplace list --json': ok(list) });
    expect(await findMarketplace(FOLDER, '', deps)).toEqual({ source: MK, origin: 'known' });
    expect(calls).toEqual([`plugin marketplace list --json @${FOLDER}`]);
  });

  it('a marketplace known by git (url) or by GitHub (repo) is used as is', async () => {
    const url = 'https://git.exemplo.dev/plan-relay.git';
    const byUrl = fake({ 'plugin marketplace list --json': ok(JSON.stringify([{ name: 'plan-relay', source: 'git', url }])) });
    expect(await findMarketplace(FOLDER, '', byUrl.deps)).toEqual({ source: url, origin: 'known' });
    const byRepo = fake({
      'plugin marketplace list --json': ok(JSON.stringify([{ name: 'plan-relay', source: 'github', repo: 'alguem/plan-relay' }])),
    });
    expect(await findMarketplace(FOLDER, '', byRepo.deps)).toEqual({ source: 'alguem/plan-relay', origin: 'known' });
  });

  it('empty setting, workspace without the repository and nothing known → the default git source', async () => {
    const { deps } = fake({ 'plugin marketplace list --json': ok('[]') });
    expect(await findMarketplace(FOLDER, '', deps)).toEqual({ source: DEFAULT_SOURCE, origin: 'default' });
  });

  it('a failing CLI list does not block: default git source', async () => {
    const { deps } = fake({ 'plugin marketplace list --json': { error: 'claude saiu com 1' } });
    expect(await findMarketplace(FOLDER, '', deps)).toEqual({ source: DEFAULT_SOURCE, origin: 'default' });
  });

  it('the default source is a GitHub owner/repo', () => {
    expect(DEFAULT_SOURCE).toMatch(/^[^/\s]+\/[^/\s]+$/);
  });
});

describe('install from the default git source', () => {
  it('empty setting and workspace without the repository: the command uses the git source', async () => {
    const s = fake({
      'plugin marketplace list --json': ok('[]'),
      'plugin marketplace add': ok(OK_MK),
      'plugin install': ok(OK_INSTALL),
    });
    const mk = await findMarketplace(FOLDER, '', s.deps);
    expect(await install(FOLDER, 'project', mk.source, s.deps)).toMatchObject({ ok: true });
    expect(s.calls.slice(1)).toEqual([
      `plugin marketplace add ${DEFAULT_SOURCE} --scope project --json @${FOLDER}`,
      `plugin install plan-relay --marketplace ${DEFAULT_SOURCE} --scope project --json @${FOLDER}`,
    ]);
  });
});

describe('install', () => {
  it('in the project without the marketplace declared: marketplace add and then install, in this order', async () => {
    const s = fake({ 'plugin marketplace add': ok(OK_MK), 'plugin install': ok(OK_INSTALL) });
    const r = await install(FOLDER, 'project', MK, s.deps);
    expect(r).toEqual({ ok: true, message: 'Successfully installed plugin: plan-relay@plan-relay (scope: user)' });
    expect(s.calls).toEqual([
      `plugin marketplace add ${MK} --scope project --json @${FOLDER}`,
      `plugin install plan-relay --marketplace ${MK} --scope project --json @${FOLDER}`,
    ]);
  });

  it('in the project with the marketplace already declared in its settings: skips marketplace add', async () => {
    const settings = JSON.stringify({ extraKnownMarketplaces: { 'plan-relay': { source: { source: 'diretory', path: MK } } } });
    const s = fake({ 'plugin install': ok(OK_INSTALL) }, { [`${FOLDER}/.claude/settings.json`]: settings });
    expect(await install(FOLDER, 'project', MK, s.deps)).toMatchObject({ ok: true });
    expect(s.calls).toEqual([`plugin install plan-relay --marketplace ${MK} --scope project --json @${FOLDER}`]);
  });

  it('in user scope: only install', async () => {
    const s = fake({ 'plugin install': ok(OK_INSTALL) });
    expect(await install(FOLDER, 'user', MK, s.deps)).toMatchObject({ ok: true });
    expect(s.calls).toEqual([`plugin install plan-relay --marketplace ${MK} --scope user --json @${FOLDER}`]);
  });

  it('failing marketplace add: error and install does not run', async () => {
    const s = fake({
      'plugin marketplace add': { error: 'claude saiu com 1: Marketplace not found' },
      'plugin install': ok(OK_INSTALL),
    });
    expect(await install(FOLDER, 'project', MK, s.deps)).toEqual({ ok: false, error: 'claude saiu com 1: Marketplace not found' });
    expect(s.calls).toHaveLength(1);
  });

  it(`exit 0 but outcome other than ok: error with the CLI's message`, async () => {
    const s = fake({ 'plugin install': ok('{"command":"install","outcome":"error","message":"Plugin not found"}\n') });
    expect(await install(FOLDER, 'user', MK, s.deps)).toEqual({ ok: false, error: 'Plugin not found' });
  });

  it('confirmation prompt from a declared command: error, nobody accepts it', async () => {
    const s = fake({ 'plugin install': ok('{"command":"install","outcome":"needs-confirmation","shownCommand":{"sha256":"ab"}}\n') });
    expect(await install(FOLDER, 'user', MK, s.deps)).toMatchObject({ ok: false });
  });
});

describe('install and uninstall by package name', () => {
  it('install: the package name given (pt-BR here) goes to the CLI', async () => {
    const s = fake({ 'plugin install': ok(OK_INSTALL) });
    expect(await install(FOLDER, 'user', MK, s.deps, 'plan-relay-pt-br')).toMatchObject({ ok: true });
    expect(s.calls).toEqual([`plugin install plan-relay-pt-br --marketplace ${MK} --scope user --json @${FOLDER}`]);
  });

  it('install without a name: plan-relay, the English package', async () => {
    const s = fake({ 'plugin install': ok(OK_INSTALL) });
    await install(FOLDER, 'user', MK, s.deps);
    expect(s.calls).toEqual([`plugin install plan-relay --marketplace ${MK} --scope user --json @${FOLDER}`]);
  });

  it('uninstall: the package name given, and --keep-data counts only its own installations', async () => {
    const list = JSON.stringify([
      { id: 'plan-relay-pt-br@plan-relay', scope: 'user', enabled: true },
      { id: 'plan-relay@plan-relay', scope: 'project', enabled: true, projectPath: FOLDER },
    ]);
    const s = fake({ 'plugin list --json': ok(list), 'plugin uninstall': ok(OK_UNINSTALL) });
    expect(await uninstall(FOLDER, 'user', s.deps, 'plan-relay-pt-br')).toMatchObject({ ok: true });
    expect(s.calls[1]).toBe(`plugin uninstall plan-relay-pt-br@plan-relay --scope user --json @${FOLDER}`);
  });
});

describe('uninstall', () => {
  // Only the CLI: `claude plugin uninstall` 2.1.316 still leaves `"enabledPlugins": {}` in the settings
  // and the cache in `<config>/plugins/cache/plan-relay/`, but neither prevents reinstalling; the extension does
  // not rewrite the user's settings or delete agent folders.
  it('user scope, with other installations: --keep-data and nothing else', async () => {
    const s = fake({ 'plugin list --json': ok(fixture('list-user.json')), 'plugin uninstall': ok(OK_UNINSTALL) });
    expect(await uninstall(FOLDER, 'user', s.deps)).toMatchObject({ ok: true });
    expect(s.calls).toEqual([
      `plugin list --json @${FOLDER}`,
      `plugin uninstall plan-relay@plan-relay --scope user --keep-data --json @${FOLDER}`,
    ]);
  });

  it('the last installation: without --keep-data, and the CLI is the only thing that runs', async () => {
    const only = JSON.stringify([{ id: 'plan-relay@plan-relay', scope: 'project', enabled: true, projectPath: FOLDER }]);
    const s = fake({ 'plugin list --json': ok(only), 'plugin uninstall': ok(OK_UNINSTALL) });
    expect(await uninstall(FOLDER, 'project', s.deps)).toMatchObject({ ok: true });
    expect(s.calls).toEqual([`plugin list --json @${FOLDER}`, `plugin uninstall plan-relay@plan-relay --scope project --json @${FOLDER}`]);
  });

  it('local: the scope goes to the CLI', async () => {
    const s = fake({ 'plugin list --json': ok(fixture('list-project.json')), 'plugin uninstall': ok(OK_UNINSTALL) });
    await uninstall(FOLDER, 'local', s.deps);
    expect(s.calls[1]).toMatch(/^plugin uninstall plan-relay@plan-relay --scope local /);
    expect(s.calls).toHaveLength(2);
  });

  it('failing uninstall: error', async () => {
    const s = fake({
      'plugin list --json': ok(fixture('list-project.json')),
      'plugin uninstall': { error: 'claude saiu com 1: not installed' },
    });
    expect(await uninstall(FOLDER, 'user', s.deps)).toEqual({ ok: false, error: 'claude saiu com 1: not installed' });
    expect(s.calls).toHaveLength(2);
  });

  it('failing initial plugin list: error and uninstall does not run', async () => {
    const s = fake({ 'plugin list --json': { error: 'claude não arrancou: spawn claude ENOENT' } });
    expect(await uninstall(FOLDER, 'user', s.deps)).toEqual({ ok: false, error: 'claude não arrancou: spawn claude ENOENT' });
    expect(s.calls).toHaveLength(1);
  });
});

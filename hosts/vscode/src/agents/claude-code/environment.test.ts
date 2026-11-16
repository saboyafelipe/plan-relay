import { describe, expect, it } from 'vitest';
import type { ProcessError, ProcessOutput } from '../../process';
import { claudeCodeChecks, type AgentEnvironmentDeps } from './environment';

function deps(extra: Partial<AgentEnvironmentDeps> = {}): AgentEnvironmentDeps & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    binary: { path: 'claude', origin: 'path' },
    search: (name) => (name === 'claude' ? '/bin/claude' : undefined),
    executable: () => true,
    runCommand: async (args): Promise<ProcessOutput | ProcessError> => {
      calls.push(args);
      return { stdout: '{"loggedIn": true, "authMethod": "claude.ai", "email": "x@y.z", "orgName": "Org"}', stderr: '' };
    },
    calls,
    ...extra,
  };
}

const status = (v: { id: string; status: string }[]) => Object.fromEntries(v.map((c) => [c.id, c.status]));

describe('Claude Code checks', () => {
  it('ids and required as in check-agent.sh; the login comes out without email or organization', async () => {
    const d = deps();
    const v = await claudeCodeChecks('/p', { state: 'active-project', scope: 'project' }, d);
    expect(v.map((c) => [c.id, c.required])).toEqual([
      ['agent-cli', false],
      ['agent-auth', false],
      ['plugin', false],
      ['plugin-current', false],
    ]);
    expect(status(v)).toEqual({ 'agent-cli': 'ok', 'agent-auth': 'ok', plugin: 'ok', 'plugin-current': 'ok' });
    expect(v[0]?.detail).toBe('/bin/claude');
    expect(v[1]?.detail).toContain('claude.ai');
    expect(JSON.stringify(v)).not.toMatch(/x@y\.z|Org/);
    expect(d.calls).toEqual([['auth', 'status', '--json']]);
  });

  it('the plugin messages name the package given: plan-relay-pt-br for the pt-BR one, plan-relay without one', async () => {
    const missing = async (plugin?: 'plan-relay' | 'plan-relay-pt-br') =>
      (await claudeCodeChecks('/p', { state: 'not-installed' }, deps(plugin ? { plugin } : {})))[2]?.detail;
    expect(await missing('plan-relay-pt-br')).toContain('plan-relay-pt-br@plan-relay');
    expect(await missing()).toContain('plan-relay@plan-relay');
    expect(await missing()).not.toContain('pt-br');
  });

  it('without the CLI: agent-cli missing and the rest unknown, running nothing', async () => {
    const d = deps({ search: () => undefined });
    const v = await claudeCodeChecks('/p', { state: 'not-installed' }, d);
    expect(status(v)).toEqual({ 'agent-cli': 'missing', 'agent-auth': 'unknown', plugin: 'unknown', 'plugin-current': 'unknown' });
    expect(d.calls).toEqual([]);
  });

  it('configured binary that does not exist: agent-cli missing with the path', async () => {
    const v = await claudeCodeChecks('/p', undefined, deps({ binary: { path: '/opt/c', origin: 'setting' }, executable: () => false }));
    expect(v[0]).toMatchObject({ id: 'agent-cli', status: 'missing' });
    expect(v[0]?.detail).toContain('/opt/c');
  });

  it('not logged in (the CLI exits 1 with the JSON on stdout): agent-auth missing; unreadable response: unknown', async () => {
    const withoutLogin = await claudeCodeChecks(
      '/p',
      undefined,
      deps({ runCommand: async () => ({ error: 'claude auth status saiu com 1: {"loggedIn": false}' }) }),
    );
    expect(withoutLogin[1]).toMatchObject({ id: 'agent-auth', status: 'missing' });
    expect(withoutLogin[1]?.detail).toContain('claude auth login');
    const unreadable = await claudeCodeChecks('/p', undefined, deps({ runCommand: async () => ({ stdout: 'Usage: …', stderr: '' }) }));
    expect(unreadable[1]).toMatchObject({ status: 'unknown' });
  });

  it('the plugin from the state already read: not installed, disabled, new version, error and not yet read', async () => {
    const de = async (plugin: Parameters<typeof claudeCodeChecks>[1]) => status(await claudeCodeChecks('/p', plugin, deps()));
    expect(await de({ state: 'not-installed' })).toMatchObject({ plugin: 'missing', 'plugin-current': 'unknown' });
    expect(await de({ state: 'inactive', scope: 'user' })).toMatchObject({ plugin: 'warning', 'plugin-current': 'ok' });
    expect(await de({ state: 'active-user', scope: 'user', newVersion: { registered: '1', folder: '2' } })).toMatchObject({
      plugin: 'ok',
      'plugin-current': 'warning',
    });
    expect(await de({ state: 'error', error: 'oops' })).toMatchObject({ plugin: 'unknown', 'plugin-current': 'unknown' });
    expect(await de({ state: 'checking' })).toMatchObject({ plugin: 'unknown', 'plugin-current': 'unknown' });
    expect(await de(undefined)).toMatchObject({ plugin: 'unknown', 'plugin-current': 'unknown' });
  });

  it('cache copy: equal → ok; different → warning with the reinstall commands for the scope; no way to compare → ok', async () => {
    const copy = { origin: '/src/dist', cache: '/home/dev/.claude/plugins/cache/plan-relay/plan-relay/0.1.0' };
    const compared: string[][] = [];
    const withFilters = (equal: boolean | undefined) =>
      deps({
        sameFolders: async (origin, cache) => {
          compared.push([origin, cache]);
          return equal;
        },
      });
    const current = async (equal: boolean | undefined, scope: 'project' | 'user' = 'project') =>
      (await claudeCodeChecks('/p', { state: 'active-project', scope, copy }, withFilters(equal)))[3];
    expect(await current(true)).toMatchObject({ id: 'plugin-current', status: 'ok' });
    expect(compared).toEqual([['/src/dist', copy.cache]]);
    const different = await current(false);
    expect(different).toMatchObject({ id: 'plugin-current', status: 'warning' });
    expect(different?.detail).toContain(copy.cache);
    expect(different?.detail).toContain('claude plugin uninstall plan-relay@plan-relay --scope project');
    expect(different?.detail).toContain('claude plugin install plan-relay@plan-relay --scope project');
    expect((await current(false, 'user'))?.detail).toContain('install plan-relay@plan-relay --scope user');
    expect(await current(undefined)).toMatchObject({ status: 'ok' });
    // a new version in the folder wins: no comparison
    compared.length = 0;
    const checks = await claudeCodeChecks(
      '/p',
      { state: 'active-project', scope: 'project', copy, newVersion: { registered: '1', folder: '2' } },
      withFilters(false),
    );
    expect(checks[3]?.detail).toContain('plugin update');
    expect(compared).toEqual([]);
    // without the dependency (another host): as before
    expect((await claudeCodeChecks('/p', { state: 'active-project', scope: 'project', copy }, deps()))[3]?.status).toBe('ok');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stringsFor } from '@plan-relay/i18n';
import { decidePluginState, readPlugin, readPluginState, type PluginStateDeps } from './plugin-state';

const PROJECT = '/home/dev/projeto';
/** readFromFolder and installPath of the fixtures. */
const COPY = {
  origin: '/home/dev/projeto/plan-relay/dist/claude-code',
  cache: '/home/dev/.claude/plugins/cache/plan-relay/plan-relay/0.1.0',
};

function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');
}

describe('decidePluginState (real outputs of plugin list --json)', () => {
  it('in the project folder: active in the project, no new version', () => {
    expect(decidePluginState(fixture('list-project.json'), [PROJECT])).toEqual({ state: 'active-project', scope: 'project', copy: COPY });
  });

  it(`another project's entry with enabled: true does not count for this folder`, () => {
    const other = '/home/dev/outro';
    expect(decidePluginState(fixture('list-project.json'), [other])).toEqual({ state: 'not-installed' });
  });

  it(`folder without settings (/tmp): not installed, despite other projects' entries`, () => {
    expect(decidePluginState(fixture('list-no-settings.json'), ['/tmp/ap42v', '/private/tmp/ap42v'])).toEqual({ state: 'not-installed' });
  });

  it(`this folder's entry with enabled: false → inactive, with the scope`, () => {
    expect(decidePluginState(fixture('list-no-settings.json'), [PROJECT])).toEqual({ state: 'inactive', scope: 'project', copy: COPY });
  });

  it('installed for the user: ativo-usuario', () => {
    expect(decidePluginState(fixture('list-user.json'), ['/tmp/ap42u', '/private/tmp/ap42u'])).toEqual({
      state: 'active-user',
      scope: 'user',
      copy: COPY,
    });
  });

  it('without readFromFolder (git source) or without installPath (old CLI) there is no copy to compare', () => {
    for (const missing of ['readFromFolder', 'installPath']) {
      const list = JSON.parse(fixture('list-project.json')) as Array<Record<string, unknown>>;
      delete list[0]?.[missing];
      expect(decidePluginState(JSON.stringify(list), [PROJECT])).not.toHaveProperty('copia');
    }
  });

  it('project wins over user when both are active', () => {
    const list = JSON.parse(fixture('list-project.json')) as unknown[];
    const userList = JSON.parse(fixture('list-user.json')) as Array<{ scope: string }>;
    const both = JSON.stringify([...list, ...userList.filter((e) => e.scope === 'user')]);
    expect(decidePluginState(both, [PROJECT])).toMatchObject({ state: 'active-project' });
  });

  it('version != folderVersion → newVersion with both', () => {
    const list = JSON.parse(fixture('list-project.json')) as Array<Record<string, unknown>>;
    const entry = list[0];
    if (entry === undefined) throw new Error('the fixture has no entry');
    entry.folderVersion = '0.2.0';
    expect(decidePluginState(JSON.stringify(list), [PROJECT])).toEqual({
      state: 'active-project',
      scope: 'project',
      newVersion: { registered: '0.1.0', folder: '0.2.0' },
      copy: COPY,
    });
  });

  it('without folderVersion there is no new version', () => {
    expect(decidePluginState(fixture('list-no-settings.json'), [PROJECT])).not.toHaveProperty('newVersion');
  });

  it('empty list → not installed', () => {
    expect(decidePluginState('[]', [PROJECT])).toEqual({ state: 'not-installed' });
  });

  it('invalid JSON → error with the start of the output', () => {
    expect(decidePluginState('Error: not logged', [PROJECT], stringsFor('pt-BR'))).toEqual({
      state: 'error',
      error: 'plugin list --json devolveu JSON inválido: Error: not logged',
    });
  });

  it('JSON that is not a list → error', () => {
    expect(decidePluginState('{"a":1}', [PROJECT])).toMatchObject({ state: 'error' });
  });
});

describe('the two packages (plan-relay in English, plan-relay-pt-br)', () => {
  const entry = (id: string, scope: string, enabled = true) => ({ id, scope, enabled, projectPath: PROJECT });
  const run = (list: unknown[]) => async () => ({ stdout: JSON.stringify(list), stderr: '' });
  const deps = (list: unknown[]): PluginStateDeps => ({ runCommand: run(list), realPath: (p) => p });

  it('the pt-BR package counts as installed, and readPlugin names it', async () => {
    const list = [entry('plan-relay-pt-br@plan-relay', 'project')];
    expect(decidePluginState(JSON.stringify(list), [PROJECT])).toEqual({ state: 'active-project', scope: 'project' });
    expect(await readPlugin(PROJECT, deps(list), 'plan-relay')).toEqual({
      state: { state: 'active-project', scope: 'project' },
      plugin: 'plan-relay-pt-br',
    });
  });

  it('the English package: readPlugin names plan-relay', async () => {
    expect(await readPlugin(PROJECT, deps([entry('plan-relay@plan-relay', 'user')]), 'plan-relay-pt-br')).toEqual({
      state: { state: 'active-user', scope: 'user' },
      plugin: 'plan-relay',
    });
  });

  it('both active in the same scope: the one of the editor language', async () => {
    const list = [entry('plan-relay@plan-relay', 'user'), entry('plan-relay-pt-br@plan-relay', 'user')];
    expect((await readPlugin(PROJECT, deps(list), 'plan-relay-pt-br')).plugin).toBe('plan-relay-pt-br');
    expect((await readPlugin(PROJECT, deps(list), 'plan-relay')).plugin).toBe('plan-relay');
  });

  it('the scope order still wins over the language: active in the project beats the other language in user', async () => {
    const list = [entry('plan-relay@plan-relay', 'user'), entry('plan-relay-pt-br@plan-relay', 'project')];
    expect(await readPlugin(PROJECT, deps(list), 'plan-relay')).toMatchObject({ plugin: 'plan-relay-pt-br' });
  });

  it('another plugin of the same marketplace is not ours', async () => {
    expect(await readPlugin(PROJECT, deps([entry('plan-relay-en@plan-relay', 'user')]), 'plan-relay')).toEqual({
      state: { state: 'not-installed' },
    });
  });
});

describe('readPluginState', () => {
  function deps(over: Partial<PluginStateDeps> = {}): PluginStateDeps {
    return {
      runCommand: async () => ({ stdout: fixture('list-project.json'), stderr: '' }),
      realPath: (p) => p,
      ...over,
    };
  }

  it('runs plugin list --json with the cwd in the folder', async () => {
    const calls: Array<{ args: string[]; cwd: string }> = [];
    const r = await readPluginState(
      PROJECT,
      deps({ runCommand: async (args, cwd) => (calls.push({ args, cwd }), { stdout: '[]', stderr: '' }) }),
    );
    expect(calls).toEqual([{ args: ['plugin', 'list', '--json'], cwd: PROJECT }]);
    expect(r).toEqual({ state: 'not-installed' });
  });

  it(`also compares with the folder's real path (/tmp → /private/tmp)`, async () => {
    const r = await readPluginState(
      '/tmp/ap42u',
      deps({
        runCommand: async () => ({ stdout: fixture('list-project-tmp.json'), stderr: '' }),
        realPath: (p) => p.replace(/^\/tmp\//, '/private/tmp/'),
      }),
    );
    expect(r).toMatchObject({ state: 'active-project', scope: 'project' });
  });

  it('process error (missing binary, non-zero exit, timeout) → error', async () => {
    const r = await readPluginState(PROJECT, deps({ runCommand: async () => ({ error: 'claude não arrancou: spawn claude ENOENT' }) }));
    expect(r).toEqual({ state: 'error', error: 'claude não arrancou: spawn claude ENOENT' });
  });

  it('a failing real path uses only the folder', async () => {
    const r = await readPluginState(
      PROJECT,
      deps({
        realPath: () => {
          throw new Error('ENOENT');
        },
      }),
    );
    expect(r).toMatchObject({ state: 'active-project' });
  });
});

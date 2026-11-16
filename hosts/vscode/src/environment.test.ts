import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nodeEnvironment } from '@plan-relay/reader/node';
import type { Check } from '@plan-relay/reader';
import { temporaryFolder } from '@plan-relay/reader/testing';
import { render } from '@plan-relay/panel';
import { readEnvironment, environmentLines } from './environment';
import { claudeCodeChecks } from './agents/claude-code/environment';
import { sameFolders } from './agents/claude-code/copy';
import { decidePluginState, PLUGIN_ID } from './agents/claude-code/plugin-state';
import { stringsFor } from '@plan-relay/i18n';

const PT = stringsFor('pt-BR');

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

/** A PATH with only the given executables (empty scripts), in a temporary folder. */
function pathWith(names: string[]): { bin: string; remove: () => void } {
  const tmp = temporaryFolder();
  const bin = join(tmp.folder, 'bin');
  mkdirSync(bin);
  for (const name of names) {
    writeFileSync(join(bin, name), '#!/bin/sh\n');
    chmodSync(join(bin, name), 0o755);
  }
  return { bin, remove: tmp.remove };
}

describe('panel environment', () => {
  it('with a built PATH without jq, the footer reports jq as missing', async () => {
    const { bin, remove } = pathWith(['git', 'sh']);
    try {
      const environment = await readEnvironment(undefined, undefined, undefined, nodeEnvironment({ PATH: bin }));
      expect(environment.ok).toBe(false);
      const html = render({ plans: [], updated: '10:00', strings: PT, environment });
      expect(html).toMatch(/<footer class="environment"[^>]*>.*Falta no ambiente: jq.*<\/footer>/s);
    } finally {
      remove();
    }
  });

  it('with jq on the PATH, no missing-item footer', async () => {
    const { bin, remove } = pathWith(['jq', 'git', 'sh']);
    try {
      const environment = await readEnvironment(undefined, undefined, undefined, nodeEnvironment({ PATH: bin }));
      expect(environment.ok).toBe(true);
      expect(render({ plans: [], updated: '10:00', strings: PT, environment })).not.toContain('<footer');
    } finally {
      remove();
    }
  });

  it(`the provider's checks come after the general ones; one that fails becomes unknown, without rejecting`, async () => {
    const deps = nodeEnvironment({ PATH: '' });
    const agent: Check = { id: 'agent-cli', status: 'ok', required: false, detail: '/x/agente' };
    const withFilters = await readEnvironment({ checksList: async () => [agent] }, '/p', undefined, deps);
    expect(withFilters.checks.map((c) => c.id)).toEqual(['jq', 'git', 'os', 'shell', 'agent-cli']);
    const failure = await readEnvironment({ checksList: () => Promise.reject(new Error('oops')) }, '/p', undefined, deps);
    expect(failure.checks.at(-1)).toMatchObject({ id: 'agent', status: 'unknown', required: false });
    expect(failure.checks.at(-1)?.detail).toContain('oops');
  });

  it('the output channel gets one line per check, with the detail; what is missing at warn level', () => {
    const lines = environmentLines(
      {
        ok: false,
        checks: [
          { id: 'jq', status: 'missing', required: true, detail: 'instale o jq' },
          { id: 'git', status: 'ok', required: false, detail: '/usr/bin/git' },
        ],
      },
      PT,
    );
    expect(lines).toEqual([
      { tier: 'warn', text: 'ambiente: jq missing (obrigatório) — instale o jq' },
      { tier: 'info', text: 'ambiente: git ok (opcional) — /usr/bin/git' },
    ]);
  });
});

describe('parity with check.sh --json', () => {
  it.skipIf(process.platform === 'win32')('the ids, the order and the required flags match the package check.sh', async () => {
    const script = join(ROOT, 'dist', 'claude-code', 'scripts', 'check.sh');
    // System-only PATH: the result changes, the ids and the required flags do not (check.sh emits all of them in
    // every branch).
    let output: string;
    try {
      output = execFileSync('sh', [script, '--json'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' }, timeout: 30_000 });
    } catch (error) {
      // Exits 1 when something required is missing; the JSON is on stdout anyway.
      output = (error as { stdout: string }).stdout;
    }
    const fromScript = (JSON.parse(output) as { checks: Check[] }).checks.map((c) => [c.id, c.required]);
    const general = (await readEnvironment(undefined, undefined, undefined, nodeEnvironment({ PATH: '' }))).checks;
    const fromAgent = await claudeCodeChecks('/p', undefined, {
      binary: { path: 'claude', origin: 'path' },
      search: () => undefined,
      executable: () => false,
      runCommand: async () => ({ error: 'sem' }),
    });
    expect([...general, ...fromAgent].map((c) => [c.id, c.required])).toEqual(fromScript);
  });

  it.skipIf(process.platform === 'win32')('plugin-current with an equal and a different cache copy: the same status', async () => {
    const tmp = temporaryFolder();
    try {
      const origin = join(tmp.folder, 'origem');
      const cache = join(tmp.folder, 'cache');
      mkdirSync(join(origin, 'skills'), { recursive: true });
      writeFileSync(join(origin, 'skills', 'SKILL.md'), 'skill\n');
      cpSync(origin, cache, { recursive: true });
      const list = JSON.stringify([
        {
          id: PLUGIN_ID,
          version: '0.1.0',
          scope: 'user',
          enabled: true,
          installPath: cache,
          readFromFolder: origin,
          folderVersion: '0.1.0',
        },
      ]);
      writeFileSync(join(tmp.folder, 'plugins.json'), list);
      // fake claude: "plugin list --json" returns the list; anything else exits 2
      const bin = join(tmp.folder, 'bin');
      mkdirSync(bin);
      writeFileSync(
        join(bin, 'claude'),
        `#!/bin/sh\n[ "$1 $2 $3" = "plugin list --json" ] || exit 2\ncat '${join(tmp.folder, 'plugins.json')}'\n`,
      );
      chmodSync(join(bin, 'claude'), 0o755);
      // the English package: its plugin.json name is the PLUGIN_ID of the list above
      const script = join(ROOT, 'dist', 'claude-code-en', 'scripts', 'check.sh');
      const fromScript = (): string => {
        let output: string;
        try {
          output = execFileSync('sh', [script, '--json'], {
            encoding: 'utf8',
            env: { PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`, HOME: tmp.folder },
            timeout: 30_000,
          });
        } catch (error) {
          output = (error as { stdout: string }).stdout;
        }
        return (JSON.parse(output) as { checks: Check[] }).checks.find((c) => c.id === 'plugin-current')!.status;
      };
      const ofPanel = async (): Promise<string> => {
        const plugin = decidePluginState(list, [tmp.folder]);
        const v = await claudeCodeChecks(tmp.folder, plugin, {
          binary: { path: 'claude', origin: 'path' },
          search: () => join(bin, 'claude'),
          executable: () => true,
          runCommand: async () => ({ error: 'sem' }),
          sameFolders,
        });
        return v.find((c) => c.id === 'plugin-current')!.status;
      };
      expect([fromScript(), await ofPanel()]).toEqual(['ok', 'ok']);
      writeFileSync(join(cache, 'skills', 'SKILL.md'), 'skill velha\n');
      expect([fromScript(), await ofPanel()]).toEqual(['warning', 'warning']);
    } finally {
      tmp.remove();
    }
  });
});

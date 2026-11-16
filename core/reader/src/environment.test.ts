// The general environment checks in TypeScript, in the shape of `check.sh --json`.
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createStrings } from '@plan-relay/i18n';
import xTest from '@plan-relay/i18n/x-test.json';
import { environmentOf, findOnPath, generalChecks, type EnvironmentDeps } from './environment';
import { nodeEnvironment } from './node';
import { temporaryFolder } from './testing/fixture';

function deps(executables: string[], extra: Partial<EnvironmentDeps> = {}): EnvironmentDeps {
  return { path: '/a:/b', platform: 'darwin', systemVersion: '24.0.0', executable: (c) => executables.includes(c), ...extra };
}

describe('findOnPath', () => {
  it('finds the first executable of the PATH, in the order of the folders', () => {
    expect(findOnPath('jq', deps(['/b/jq', '/a/jq']))).toBe('/a/jq');
    expect(findOnPath('jq', deps(['/b/jq']))).toBe('/b/jq');
    expect(findOnPath('jq', deps([]))).toBeUndefined();
    expect(findOnPath('jq', deps(['/a/jq'], { path: undefined }))).toBeUndefined();
  });

  it('on Windows it splits by ; and tries the PATHEXT extensions', () => {
    const d = deps(['C:\\Git\\bin\\sh.EXE'], { platform: 'win32', path: 'C:\\x;C:\\Git\\bin\\', pathext: '.COM;.EXE' });
    expect(findOnPath('sh', d)).toBe('C:\\Git\\bin\\sh.EXE');
  });
});

describe('generalChecks', () => {
  it('ids, order and required as in check.sh: jq (required), git, os, shell', () => {
    const v = generalChecks(deps(['/a/jq', '/a/git', '/a/sh']));
    expect(v.map((c) => [c.id, c.required])).toEqual([
      ['jq', true],
      ['git', false],
      ['os', false],
      ['shell', false],
    ]);
    expect(v.every((c) => c.status === 'ok')).toBe(true);
    expect(v[0]?.detail).toBe('/a/jq');
    expect(environmentOf(v).ok).toBe(true);
  });

  it('without jq: required missing, ok false, and the detail says how to install', () => {
    const v = generalChecks(deps(['/a/git', '/a/sh']));
    expect(v[0]).toMatchObject({ id: 'jq', status: 'missing', required: true });
    expect(v[0]?.detail).toContain('brew install jq');
    expect(environmentOf(v).ok).toBe(false);
  });

  it('without git: optional missing, ok stays true', () => {
    const v = generalChecks(deps(['/a/jq', '/a/sh']));
    expect(v[1]).toMatchObject({ id: 'git', status: 'missing', required: false });
    expect(environmentOf(v).ok).toBe(true);
  });

  it('the system: Darwin, Linux, Linux (WSL), Windows', () => {
    const os = (platform: string, systemVersion = '6.1') =>
      generalChecks(deps([], { platform: platform, systemVersion: systemVersion }))[2]?.detail;
    expect(os('darwin')).toBe('Darwin');
    expect(os('linux')).toBe('Linux');
    expect(os('linux', '5.15.90.1-microsoft-standard-WSL2')).toBe('Linux (WSL)');
    expect(os('win32')).toBe('Windows');
  });

  it('Windows without sh in the PATH: the missing shell shows up, with the Git Bash path', () => {
    const shell = generalChecks(deps([], { platform: 'win32', path: 'C:\\x' }))[3];
    expect(shell).toMatchObject({ id: 'shell', status: 'missing', required: false });
    expect(shell?.detail).toContain('Git Bash');
    const withSh = generalChecks(deps(['C:\\Git\\bin\\sh.exe'], { platform: 'win32', path: 'C:\\Git\\bin', pathext: '.exe' }))[3];
    expect(withSh).toMatchObject({ status: 'ok' });
    expect(withSh?.detail).toContain('C:\\Git\\bin\\sh.exe');
  });

  it('the detail comes from the given language', () => {
    const v = generalChecks({ ...deps([]), strings: createStrings('x-test', xTest) });
    expect(v[0]?.detail).toBe('x-test:environment.jqMissing');
  });
});

describe('nodeEnvironment', () => {
  it('with a PATH built without jq, jq is missing and git (present) is not', () => {
    const tmp = temporaryFolder();
    try {
      const bin = join(tmp.folder, 'bin');
      mkdirSync(bin);
      for (const name of ['git', 'sh']) {
        writeFileSync(join(bin, name), '#!/bin/sh\n');
        chmodSync(join(bin, name), 0o755);
      }
      // A jq without execute permission does not count.
      writeFileSync(join(bin, 'jq'), '');
      const v = generalChecks(nodeEnvironment({ PATH: bin }));
      expect(v.find((c) => c.id === 'jq')?.status).toBe('missing');
      expect(v.find((c) => c.id === 'git')).toMatchObject({ status: 'ok', detail: join(bin, 'git') });
    } finally {
      tmp.remove();
    }
  });
});

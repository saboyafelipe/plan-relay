import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { temporaryFolder } from '@plan-relay/reader/testing';
import { createStrings, stringsFor } from '@plan-relay/i18n';
import xTest from '@plan-relay/i18n/x-test.json';
import { outdatedExtensionNotice } from './extension-version';

const OWN = { publisher: 'saboyafelipe', name: 'plan-relay', version: '0.0.1' };
const X = createStrings('x-test', xTest);

describe('outdatedExtensionNotice (the installed extension against the one in the open repository)', () => {
  let tmp: { folder: string; remove: () => void };

  function writePackage(content: unknown): void {
    mkdirSync(join(tmp.folder, 'hosts', 'vscode'), { recursive: true });
    writeFileSync(join(tmp.folder, 'hosts', 'vscode', 'package.json'), typeof content === 'string' ? content : JSON.stringify(content));
  }

  beforeEach(() => {
    tmp = temporaryFolder();
  });
  afterEach(() => tmp.remove());

  it('same publisher and name, different version → notice with both versions and how to reinstall', async () => {
    writePackage({ publisher: 'saboyafelipe', name: 'plan-relay', version: '0.1.0' });
    expect(await outdatedExtensionNotice(tmp.folder, OWN, X)).toBe('x-test:extension.outdated 0.0.1 0.1.0');
    const pt = await outdatedExtensionNotice(tmp.folder, OWN, stringsFor('pt-BR'));
    expect(pt).toContain('0.0.1');
    expect(pt).toContain('0.1.0');
    expect(pt).toContain('npm --prefix hosts/vscode run package');
    expect(pt).toContain('Install from VSIX');
  });

  it('same version → nothing', async () => {
    writePackage({ publisher: 'saboyafelipe', name: 'plan-relay', version: '0.0.1' });
    expect(await outdatedExtensionNotice(tmp.folder, OWN, X)).toBeUndefined();
  });

  it('another extension (different publisher or name) → nothing', async () => {
    writePackage({ publisher: 'outro', name: 'plan-relay', version: '0.1.0' });
    expect(await outdatedExtensionNotice(tmp.folder, OWN, X)).toBeUndefined();
    writePackage({ publisher: 'saboyafelipe', name: 'outra', version: '0.1.0' });
    expect(await outdatedExtensionNotice(tmp.folder, OWN, X)).toBeUndefined();
  });

  it('no package.json, unreadable, no version or no folder → nothing', async () => {
    expect(await outdatedExtensionNotice(tmp.folder, OWN, X)).toBeUndefined();
    writePackage('{ não é json');
    expect(await outdatedExtensionNotice(tmp.folder, OWN, X)).toBeUndefined();
    writePackage({ publisher: 'saboyafelipe', name: 'plan-relay' });
    expect(await outdatedExtensionNotice(tmp.folder, OWN, X)).toBeUndefined();
    expect(await outdatedExtensionNotice(undefined, OWN, X)).toBeUndefined();
  });
});

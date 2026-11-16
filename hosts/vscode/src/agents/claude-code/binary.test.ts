import { describe, expect, it } from 'vitest';
import { claudeBinary, type BinaryDeps } from './binary';

const OFFICIAL = '/ext/anthropic.claude-code-2.1.323';
const NATIVE = `${OFFICIAL}/resources/native-binary/claude`;

function deps(over: Partial<BinaryDeps> = {}): BinaryDeps {
  return { configured: '', officialFolder: OFFICIAL, exists: (c) => c === NATIVE, windows: false, ...over };
}

describe('claudeBinary', () => {
  it('the configuration overrides everything, even with the official extension', () => {
    expect(claudeBinary(deps({ configured: '/opt/claude' }))).toEqual({ path: '/opt/claude', origin: 'setting' });
  });

  it('a configuration of only spaces counts as empty', () => {
    expect(claudeBinary(deps({ configured: '   ' }))).toEqual({ path: NATIVE, origin: 'official-extension' });
  });

  it(`without configuration it uses the official extension's native binary`, () => {
    expect(claudeBinary(deps())).toEqual({ path: NATIVE, origin: 'official-extension' });
  });

  it('official extension without the native binary → the claude on the PATH', () => {
    expect(claudeBinary(deps({ exists: () => false }))).toEqual({ path: 'claude', origin: 'path' });
  });

  it('without the official extension → the claude on the PATH', () => {
    expect(claudeBinary(deps({ officialFolder: undefined }))).toEqual({ path: 'claude', origin: 'path' });
  });

  it('on Windows the native one is claude.exe', () => {
    const exe = `${OFFICIAL}/resources/native-binary/claude.exe`;
    expect(claudeBinary(deps({ windows: true, exists: (c) => c === exe }))).toEqual({ path: exe, origin: 'official-extension' });
  });
});

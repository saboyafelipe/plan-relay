import { describe, expect, it } from 'vitest';
import { stringsFor } from '@plan-relay/i18n';
import { openWithPrompt, otherFolderNotice, copiedMessage, activeProvider, type CopyDeps } from './provider';

const PT = stringsFor('pt-BR');

function deps(): CopyDeps & { copied: string[]; notices: string[]; lines: string[] } {
  const copied: string[] = [];
  const notices: string[] = [];
  const lines: string[] = [];
  return {
    copied,
    notices,
    lines,
    copy: async (t) => {
      copied.push(t);
    },
    alert: (t) => notices.push(t),
    channel: { info: (t) => lines.push(t) },
    strings: PT,
  };
}

describe('openWithPrompt', () => {
  it('provider that can open: opens through it and does not copy', async () => {
    const d = deps();
    const opened: string[] = [];
    const provider = {
      name: 'Agente X',
      openWithPrompt: async (p: string) => {
        opened.push(p);
        return 'command';
      },
    };
    expect(await openWithPrompt(provider, '/x:plan p F1-01', d)).toBe('command');
    expect(opened).toEqual(['/x:plan p F1-01']);
    expect(d.copied).toEqual([]);
  });

  it('provider that cannot open: copies the prompt and says where to paste', async () => {
    const d = deps();
    expect(await openWithPrompt({ name: 'Agente X' }, '$plan p F1-01', d)).toBe('copied');
    expect(d.copied).toEqual(['$plan p F1-01']);
    expect(d.notices).toEqual([copiedMessage('Agente X', PT)]);
    expect(copiedMessage('Agente X', PT)).toBe('O prompt foi copiado — cole-o na caixa do Agente X.');
    expect(d.lines).toEqual(['agente: Agente X não sabe abrir — prompt copiado']);
  });

  it('no provider: copies and says so', async () => {
    const d = deps();
    expect(await openWithPrompt(undefined, 'p', d)).toBe('copied');
    expect(d.copied).toEqual(['p']);
    expect(d.notices[0]).toMatch(/copiado/);
  });
});

describe('activeProvider', () => {
  const p = (name: string, present: boolean) => ({ name, detect: () => present });

  it('the first one present in this editor', () => {
    expect(activeProvider([p('a', false), p('b', true), p('c', true)])?.name).toBe('b');
  });

  it('none present: the first (default); empty list: none', () => {
    expect(activeProvider([p('a', false), p('b', false)])?.name).toBe('a');
    expect(activeProvider([])).toBeUndefined();
  });
});

describe('otherFolderNotice', () => {
  it('a single folder, or the plan in the first: nothing to say', () => {
    expect(otherFolderNotice('Agente X', '/ws/projeto', ['/ws/projeto'])).toBeUndefined();
    expect(otherFolderNotice('Agente X', '/ws/projeto', ['/ws/projeto', '/tmp/exemplo'])).toBeUndefined();
  });

  it('plan in another folder: says the session opens in the first and names both and the agent', () => {
    const notice = otherFolderNotice('Agente X', '/tmp/exemplo', ['/ws/projeto', '/tmp/exemplo'], PT);
    expect(notice).toContain('«projeto»');
    expect(notice).toContain('«exemplo»');
    expect(notice).toContain('O Agente X abre');
  });
});

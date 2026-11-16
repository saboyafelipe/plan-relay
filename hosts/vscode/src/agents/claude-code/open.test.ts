import { describe, expect, it, vi } from 'vitest';
import { stringsFor } from '@plan-relay/i18n';
import { copiedMessage } from '../provider';
import { openClaude, AGENT_NAME, CLAUDE_COMMAND, promptUri, restrictedMessage, type OpenDeps, type UriParts } from './open';

// The cases run in pt-BR, passed to `openClaude` through `strings`.
const PT = stringsFor('pt-BR');
const COPIED_MESSAGE = copiedMessage(AGENT_NAME, PT);
const RESTRICTED_MESSAGE = restrictedMessage(PT);

const PROMPT = '/construir-plan-relay F4-01';

interface Fake {
  deps: OpenDeps;
  lines: string[];
  commandList: unknown[][];
  uris: UriParts[];
  copied: string[];
  notices: string[];
}

/** A simulated `vscode`: each dependency records the call and does what the case asks. */
function simulate(options: {
  command?: () => Promise<unknown>;
  installed?: boolean;
  uri?: () => Promise<boolean>;
  trusted?: boolean;
}): Fake {
  const s = { lines: [], commandList: [], uris: [], copied: [], notices: [] } as unknown as Fake;
  s.deps = {
    strings: PT,
    executeCommand: (command, ...args) => {
      s.commandList.push([command, ...args]);
      return (options.command ?? (() => Promise.resolve(undefined)))();
    },
    extensionInstalled: () => options.installed ?? true,
    trustedWorkspace: () => options.trusted ?? true,
    openUri: (parts) => {
      s.uris.push(parts);
      return (options.uri ?? (() => Promise.resolve(true)))();
    },
    copy: (text) => {
      s.copied.push(text);
      return Promise.resolve();
    },
    alert: (text) => {
      s.notices.push(text);
    },
    channel: {
      info: (text) => s.lines.push(`info ${text}`),
      warn: (text) => s.lines.push(`warn ${text}`),
    },
  };
  return s;
}

const notFound = () => Promise.reject(new Error(`command '${CLAUDE_COMMAND}' not found`));

describe('openClaude', () => {
  it('the command resolves: opens through it and does not touch the URI or the clipboard', async () => {
    const s = simulate({});
    expect(await openClaude(PROMPT, s.deps)).toBe('command');
    expect(s.commandList).toEqual([[CLAUDE_COMMAND, undefined, PROMPT]]);
    expect(s.uris).toEqual([]);
    expect(s.copied).toEqual([]);
    expect(s.notices).toEqual([]);
    expect(s.lines).toEqual(['info claude: comando ok']);
  });

  it('the command throws: falls back to the URI, which accepts', async () => {
    const s = simulate({ command: notFound });
    expect(await openClaude(PROMPT, s.deps)).toBe('uri');
    expect(s.uris).toEqual([promptUri(PROMPT)]);
    expect(s.copied).toEqual([]);
    expect(s.lines[0]).toBe(`warn claude: comando falhou — command '${CLAUDE_COMMAND}' not found`);
    expect(s.lines[1]).toMatch(/^info claude: uri aceite vscode:\/\/anthropic\.claude-code\/open\?prompt=/);
    expect(s.lines).toHaveLength(2);
  });

  it('the command throws and the URI returns false: copies and notifies', async () => {
    const s = simulate({ command: notFound, uri: () => Promise.resolve(false) });
    expect(await openClaude(PROMPT, s.deps)).toBe('copied');
    expect(s.copied).toEqual([PROMPT]);
    expect(s.notices).toEqual([COPIED_MESSAGE]);
    expect(COPIED_MESSAGE).toBe('O prompt foi copiado — cole-o na caixa do Claude Code.');
    expect(s.lines[1]).toMatch(/^warn claude: uri recusado /);
    expect(s.lines[2]).toBe('info claude: prompt copiado');
  });

  it('the command throws and the URI throws: copies and notifies', async () => {
    // A non-Error reason on purpose: the code under test must cope with whatever a command rejects with.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the string rejection is the case being tested
    const s = simulate({ command: () => Promise.reject('outro erro'), uri: () => Promise.reject(new Error('sem opener')) });
    expect(await openClaude(PROMPT, s.deps)).toBe('copied');
    expect(s.copied).toEqual([PROMPT]);
    expect(s.notices).toEqual([COPIED_MESSAGE]);
    expect(s.lines).toEqual([
      'warn claude: comando falhou — outro erro',
      'warn claude: uri falhou — sem opener',
      'info claude: prompt copiado',
    ]);
  });

  it('without the official extension it does not try the URI (VS Code would accept it and offer to install it): copies', async () => {
    const s = simulate({ command: notFound, installed: false });
    expect(await openClaude(PROMPT, s.deps)).toBe('copied');
    expect(s.uris).toEqual([]);
    expect(s.copied).toEqual([PROMPT]);
    expect(s.lines).toEqual([
      `warn claude: comando falhou — command '${CLAUDE_COMMAND}' not found`,
      'info claude: uri saltado — extensão anthropic.claude-code não instalada',
      'info claude: prompt copiado',
    ]);
  });

  it('does not wait for the user to dismiss the notification', async () => {
    const s = simulate({ command: notFound, installed: false });
    const alert = vi.fn(() => new Promise<never>(() => {}));
    s.deps.alert = alert;
    expect(await openClaude(PROMPT, s.deps)).toBe('copied');
    expect(alert).toHaveBeenCalledOnce();
  });
});

describe('promptUri', () => {
  it(`points to the official extension's /open`, () => {
    const u = promptUri(PROMPT);
    expect(u.scheme).toBe('vscode');
    expect(u.authority).toBe('anthropic.claude-code');
    expect(u.path).toBe('/open');
  });

  it('encodes the prompt and the official extension reads it back the same (URLSearchParams over the query)', () => {
    const hardOnes = [
      PROMPT,
      '/plan-relay:run agent_plans/construir-plan-relay',
      'a b/c#d?e&f=g+h%20i',
      'ação — Épico «n.º 5» 100%',
      'linha 1\nlinha 2',
      '&prompt=outro&session=x',
    ];
    for (const prompt of hardOnes) {
      const { query } = promptUri(prompt);
      expect(query, prompt).toMatch(/^prompt=[^ #&?+=\n]*$/);
      const params = new URLSearchParams(query);
      expect([...params.keys()], prompt).toEqual(['prompt']);
      expect(params.get('prompt'), prompt).toBe(prompt);
    }
  });
});

describe('openClaude — restricted mode', () => {
  it('untrusted workspace: copies and says to trust the workspace, instead of just "paste"', async () => {
    const s = simulate({ command: notFound, installed: false, trusted: false });
    expect(await openClaude(PROMPT, s.deps)).toBe('copied');
    expect(s.copied).toEqual([PROMPT]);
    expect(s.notices).toEqual([RESTRICTED_MESSAGE]);
    expect(RESTRICTED_MESSAGE).toMatch(/confie no workspace/i);
    expect(RESTRICTED_MESSAGE).toMatch(/copiado/);
    expect(s.lines).toContain('warn claude: workspace em modo restrito — a extensão oficial não carrega');
  });

  it('trusted workspace: the usual message', async () => {
    const s = simulate({ command: notFound, installed: false, trusted: true });
    await openClaude(PROMPT, s.deps);
    expect(s.notices).toEqual([COPIED_MESSAGE]);
  });
});

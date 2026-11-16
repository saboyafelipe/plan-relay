// The environment footer: what is missing on the machine, from the list in the shape of `check.sh --json`.
import type { EnvironmentInput, CheckInput } from './messages';
import { isHostMessage } from './messages';
import { render as renderIn } from './render';
import { stringsFor } from '@plan-relay/i18n';
import { environmentView } from './footer';

// The expectations are in pt-BR; the code falls back to English.
const render = (input: Parameters<typeof renderIn>[0]): string => renderIn({ ...input, strings: input.strings ?? stringsFor('pt-BR') });

function v(id: string, status: CheckInput['status'], required = false): CheckInput {
  return { id, status, required, detail: `detalhe de ${id}` };
}

function env(...checks: CheckInput[]): EnvironmentInput {
  return { ok: !checks.some((c) => c.required && c.status !== 'ok'), checks };
}

const allOk = env(v('jq', 'ok', true), v('git', 'ok'), v('os', 'ok'), v('shell', 'ok'));

describe('environmentView', () => {
  it('separates the missing required check from the optional one that asks for attention; ok and unknown do not enter', () => {
    const a = env(v('jq', 'missing', true), v('git', 'missing'), v('os', 'unknown'), v('shell', 'warning'), v('plugin', 'ok'));
    expect(environmentView(a)).toEqual({ missing: ['jq'], attention: ['git', 'shell'] });
    expect(environmentView(allOk)).toEqual({ missing: [], attention: [] });
  });
});

describe('footer in the render', () => {
  const footer = (a?: EnvironmentInput) => {
    const html = render({ plans: [], updated: '10:00', environment: a });
    return html.match(/<footer class="environment[^"]*"[^>]*>.*<\/footer>/s)?.[0];
  };

  it('nothing is missing (or it has not been checked yet): no footer', () => {
    expect(footer(allOk)).toBeUndefined();
    expect(footer(undefined)).toBeUndefined();
  });

  it('a missing required check: a warning with the id and where the detail is', () => {
    const html = footer(env(v('jq', 'missing', true), v('git', 'ok')));
    expect(html).toContain('environment-missing');
    expect(html).toContain('Falta no ambiente: jq');
    expect(html).toContain('canal de saída');
    expect(html).not.toContain('detalhe de jq');
  });

  it('optional: a note, no warning', () => {
    const html = footer(env(v('jq', 'ok', true), v('git', 'missing'), v('agent-auth', 'warning')));
    expect(html).toContain('environment-note');
    expect(html).not.toContain('environment-missing');
    expect(html).toContain('git, agent-auth');
  });

  it('the id comes escaped', () => {
    expect(footer(env(v('<x>', 'missing', true)))).toContain('&lt;x&gt;');
  });

  it('the footer comes after the cards', () => {
    const plan = { id: 'p', name: 'P', pct: 0, done: 0, total: 0, phases: [], tasks: [], parallel: [] };
    const html = render({ plans: [plan], updated: '10:00', environment: env(v('jq', 'missing', true)) });
    expect(html.indexOf('<footer')).toBeGreaterThan(html.indexOf('<article'));
  });
});

describe('«environment» message', () => {
  it('accepts the list in the shape of check.sh --json and refuses the rest', () => {
    expect(isHostMessage({ type: 'environment', environment: allOk })).toBe(true);
    expect(
      isHostMessage({
        type: 'environment',
        environment: { ok: true, checks: [{ id: 'jq', status: 'talvez', required: true, detail: '' }] },
      }),
    ).toBe(false);
    expect(isHostMessage({ type: 'environment', environment: { ok: true } })).toBe(false);
    expect(isHostMessage({ type: 'environment' })).toBe(false);
  });
});

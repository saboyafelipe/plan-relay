import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { stringsFor } from '@plan-relay/i18n';
import { headOf, runProcess } from './process';

const EN = stringsFor('en');

function sh(script: string, timeoutMs = 5000) {
  return runProcess('sh', ['-c', script], { cwd: tmpdir(), timeoutMs, name: 'probe', strings: EN });
}

describe('headOf', () => {
  it('one line, without the spaces around', () => {
    expect(headOf('  a\n\n b\tc  ')).toBe('a b c');
  });

  it('a long text is cut with an ellipsis', () => {
    const head = headOf('x'.repeat(500));
    expect(head).toHaveLength(201);
    expect(head.endsWith('…')).toBe(true);
  });
});

describe('runProcess', () => {
  it('exit 0 gives stdout and stderr', async () => {
    expect(await sh('echo out; echo err >&2')).toEqual({ stdout: 'out\n', stderr: 'err\n' });
  });

  it('another exit gives the code and the start of stderr', async () => {
    expect(await sh('echo "it broke" >&2; exit 3')).toEqual({ error: `probe ${EN.t('process.exitedWith', 3)}: it broke` });
  });

  it('without stderr, the start of stdout; without either, only the code', async () => {
    expect(await sh('echo only out; exit 1')).toEqual({ error: `probe ${EN.t('process.exitedWith', 1)}: only out` });
    expect(await sh('exit 2')).toEqual({ error: `probe ${EN.t('process.exitedWith', 2)}` });
  });

  it('ended by a signal, says which', async () => {
    expect(await sh('kill -TERM $$')).toEqual({ error: `probe ${EN.t('process.endedBy', 'SIGTERM')}` });
  });

  it('a command that does not exist does not start', async () => {
    const r = await runProcess('/nonexistent/binary', [], { cwd: tmpdir(), timeoutMs: 5000, name: 'ghost', strings: EN });
    expect('error' in r && r.error.startsWith(EN.t('process.didNotStart', 'ghost', ''))).toBe(true);
  });

  it('on timeout the whole group dies, a child that holds stdout included, and the answer does not wait for it', async () => {
    // The child holds stdout for 30 s: if the answer waited for it, vitest's own test timeout would fail this test.
    const pidFile = join(mkdtempSync(join(tmpdir(), 'probe-')), 'child.pid');
    expect(await sh(`sleep 30 & echo $! > ${pidFile}; wait`, 500)).toEqual({ error: EN.t('process.timeout', 'probe', 500) });
    const child = Number(readFileSync(pidFile, 'utf8'));
    expect(child).toBeGreaterThan(1);
    await vi.waitFor(() => {
      expect(() => process.kill(child, 0)).toThrow();
    });
  });

  it('an output beyond the limit stops the process', async () => {
    // 11 MiB of zeros, above the 10 MiB limit.
    const r = await sh('head -c 11534336 /dev/zero', 20_000);
    expect(r).toEqual({ error: EN.t('process.outputTooLarge', 'probe') });
  });

  it('without strings, the messages are in English, the fallback', async () => {
    const r = await runProcess('sh', ['-c', 'exit 4'], { cwd: tmpdir(), timeoutMs: 5000, name: 'probe' });
    expect(r).toEqual({ error: `probe ${stringsFor('en').t('process.exitedWith', 4)}` });
  });
});

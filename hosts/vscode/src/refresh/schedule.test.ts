import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Schedule, readPluginOnLoad, type RefreshReason } from './schedule';

const MIN = 60_000;

/** A load that lasts `durationMs` on the fake clock and records the reason of each call. */
function loads(durationMs = 0) {
  const reasons: RefreshReason[] = [];
  let activeOnes = 0;
  let maxActive = 0;
  const load = (reason: RefreshReason) => {
    reasons.push(reason);
    activeOnes += 1;
    maxActive = Math.max(maxActive, activeOnes);
    if (durationMs === 0) {
      activeOnes -= 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolveFn) => {
      setTimeout(() => {
        activeOnes -= 1;
        resolveFn();
      }, durationMs);
    });
  };
  return { load, reasons, maxActive: () => maxActive };
}

describe('Schedule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ten requests within 200 ms produce a single load, 500 ms after the last', async () => {
    const c = loads();
    const schedule = new Schedule({ load: c.load, intervalMinutes: 0, visible: true });
    for (let i = 0; i < 10; i++) {
      schedule.request('file');
      await vi.advanceTimersByTimeAsync(20);
    }
    await vi.advanceTimersByTimeAsync(400);
    expect(c.reasons).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(c.reasons).toEqual(['file']);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(c.reasons).toEqual(['file']);
    schedule.dispose();
  });

  it('requests during a slow load produce exactly one more at the end, never two at the same time', async () => {
    const c = loads(3_000);
    const schedule = new Schedule({ load: c.load, intervalMinutes: 0, visible: true });
    schedule.request('command');
    await vi.advanceTimersByTimeAsync(500);
    expect(c.reasons).toEqual(['command']);
    schedule.request('file');
    await vi.advanceTimersByTimeAsync(600);
    schedule.request('file');
    await vi.advanceTimersByTimeAsync(600);
    schedule.request('button');
    await vi.advanceTimersByTimeAsync(600);
    expect(c.reasons).toEqual(['command']);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(c.reasons).toEqual(['command', 'button']);
    expect(c.maxActive()).toBe(1);
    schedule.dispose();
  });

  it('with interval 5 it loads at 5 min', async () => {
    const c = loads();
    const schedule = new Schedule({ load: c.load, intervalMinutes: 5, visible: true });
    await vi.advanceTimersByTimeAsync(5 * MIN - 1);
    expect(c.reasons).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(c.reasons).toEqual(['interval']);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(c.reasons).toEqual(['interval', 'interval']);
    schedule.dispose();
  });

  it('with interval 0 it never loads on its own', async () => {
    const c = loads();
    const schedule = new Schedule({ load: c.load, intervalMinutes: 0, visible: true });
    await vi.advanceTimersByTimeAsync(60 * MIN);
    expect(c.reasons).toEqual([]);
    schedule.dispose();
  });

  it('hidden for 10 min it does not load, and loads once when visible again', async () => {
    const c = loads();
    const schedule = new Schedule({ load: c.load, intervalMinutes: 5, visible: true });
    schedule.visible(false);
    schedule.request('file');
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(c.reasons).toEqual([]);
    schedule.visible(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(c.reasons).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5 * MIN - 501);
    expect(c.reasons).toHaveLength(1);
    schedule.dispose();
  });

  it('hidden with no requests and before the interval it does not load when visible again', async () => {
    const c = loads();
    const schedule = new Schedule({ load: c.load, intervalMinutes: 5, visible: true });
    schedule.visible(false);
    await vi.advanceTimersByTimeAsync(2 * MIN);
    schedule.visible(true);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(c.reasons).toEqual([]);
    // The interval counts from the start, not from when it became visible again.
    await vi.advanceTimersByTimeAsync(3 * MIN - 1_000);
    expect(c.reasons).toEqual(['interval']);
    schedule.dispose();
  });

  it('changing the interval from 5 to 1 puts the next load at 1 min', async () => {
    const c = loads();
    const schedule = new Schedule({ load: c.load, intervalMinutes: 5, visible: true });
    await vi.advanceTimersByTimeAsync(2 * MIN);
    schedule.setInterval(1);
    await vi.advanceTimersByTimeAsync(MIN - 1);
    expect(c.reasons).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(c.reasons).toEqual(['interval']);
    await vi.advanceTimersByTimeAsync(MIN);
    expect(c.reasons).toEqual(['interval', 'interval']);
    schedule.dispose();
  });

  it('requesting with evenHidden loads even with the view hidden', async () => {
    const c = loads();
    const schedule = new Schedule({ load: c.load, intervalMinutes: 0, visible: false });
    schedule.request('command', { evenHidden: true });
    await vi.advanceTimersByTimeAsync(500);
    expect(c.reasons).toEqual(['command']);
    schedule.dispose();
  });

  it('a load that rejects does not jam the schedule', async () => {
    const reasons: RefreshReason[] = [];
    const schedule = new Schedule({
      load: (m) => {
        reasons.push(m);
        return Promise.reject(new Error('partiu'));
      },
      intervalMinutes: 0,
      visible: true,
    });
    schedule.request('file');
    await vi.advanceTimersByTimeAsync(500);
    schedule.request('button');
    await vi.advanceTimersByTimeAsync(500);
    expect(reasons).toEqual(['file', 'button']);
    schedule.dispose();
  });

  it('after dispose it does not load', async () => {
    const c = loads();
    const schedule = new Schedule({ load: c.load, intervalMinutes: 1, visible: true });
    schedule.request('file');
    schedule.dispose();
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(c.reasons).toEqual([]);
  });
});

describe('readPluginOnLoad', () => {
  it('a load triggered by plan files does not re-read the plugin', () => {
    expect(readPluginOnLoad('file', false)).toBe(false);
  });

  it('re-reads when a Claude Code settings file changed since the last load', () => {
    expect(readPluginOnLoad('file', true)).toBe(true);
  });

  it.each<RefreshReason>(['activation', 'ready', 'button', 'command', 'interval'])('relê na carga por %s', (reason) => {
    expect(readPluginOnLoad(reason, false)).toBe(true);
  });
});

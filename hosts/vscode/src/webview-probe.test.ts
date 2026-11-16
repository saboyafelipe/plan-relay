import { describe, expect, it, vi } from 'vitest';
import { WebviewProbe } from './webview-probe';

describe('WebviewProbe', () => {
  it('with no page bound, nothing is delivered to the panel nor to the confirmation', async () => {
    const probe = new WebviewProbe();
    await expect(probe.toPanel({ type: 'ready' })).resolves.toBe(false);
    expect(probe.toConfirmation({ type: 'back' })).toBe(false);
  });

  it('hands the message to the last panel page bound and resolves when it is handled', async () => {
    const probe = new WebviewProbe();
    const first = vi.fn(() => Promise.resolve());
    const last = vi.fn(() => Promise.resolve());
    probe.panelBound(first);
    probe.panelBound(last);
    await expect(probe.toPanel({ type: 'refresh' })).resolves.toBe(true);
    expect(first).not.toHaveBeenCalled();
    expect(last).toHaveBeenCalledWith({ type: 'refresh' });
  });

  it('records what the host posted, in order', () => {
    const probe = new WebviewProbe();
    probe.record({ type: 'loading', active: true });
    probe.record({ type: 'notices', notices: [] });
    expect(probe.posted).toEqual([
      { type: 'loading', active: true },
      { type: 'notices', notices: [] },
    ]);
  });

  it('a closed confirmation is let go only if it is the open one', () => {
    const probe = new WebviewProbe();
    const older = vi.fn(() => Promise.resolve());
    const open = vi.fn(() => Promise.resolve());
    probe.confirmationOpened(open);
    probe.confirmationClosed(older);
    expect(probe.toConfirmation({ type: 'back' })).toBe(true);
    expect(open).toHaveBeenCalledWith({ type: 'back' });
    probe.confirmationClosed(open);
    expect(probe.toConfirmation({ type: 'back' })).toBe(false);
  });
});

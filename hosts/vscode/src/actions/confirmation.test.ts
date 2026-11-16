import { beforeEach, describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { stringsFor } from '@plan-relay/i18n';
import type { ConfirmationData } from '@plan-relay/panel';
import { fake, Uri } from '../testing/vscode';
import { WebviewProbe } from '../webview-probe';
import { confirmInTab } from './confirmation';

const EN = stringsFor('en');
const DATA: ConfirmationData = {
  preview: {
    root: 'F1-01',
    falls: [{ id: 'F1-01', title: 'First', status: 'ready', phase: 'phase-1-base', parent: null, depth: 0, also_depends_on: [] }],
    abandoned_phases: [],
  },
  phases: { 'phase-1-base': 'Base' },
};

/** Opens the confirmation and returns the answer still pending and the tab it opened. */
function open(probe?: WebviewProbe) {
  const answer = confirmInTab(Uri.file('/ext') as unknown as vscode.Uri, DATA, EN, probe);
  const tab = fake.panels.at(-1);
  if (!tab) throw new Error('no tab opened');
  return { answer, tab };
}

beforeEach(() => fake.reset());

describe('confirmInTab', () => {
  it('opens a give-up tab with the confirmation page', () => {
    const { tab } = open();
    expect(tab.viewType).toBe('planRelay.giveUp');
    expect(tab.webview.html).toContain('confirmation.js');
  });

  it('"Abandon" returns the reason and closes the tab', async () => {
    const { answer, tab } = open();
    tab.webview.receive({ type: 'abandon', reason: 'No machine available' });
    await expect(answer).resolves.toBe('No machine available');
    expect(tab.disposed).toBe(true);
  });

  it('"Go back" returns nothing and closes the tab', async () => {
    const { answer, tab } = open();
    tab.webview.receive({ type: 'back' });
    await expect(answer).resolves.toBeUndefined();
    expect(tab.disposed).toBe(true);
  });

  it('closing the tab counts as "Go back"; a reply after that changes nothing', async () => {
    const { answer, tab } = open();
    tab.dispose();
    tab.webview.receive({ type: 'abandon', reason: 'Too late' });
    await expect(answer).resolves.toBeUndefined();
  });

  it('a message outside the reply contract is ignored', async () => {
    const { answer, tab } = open();
    tab.webview.receive({ type: 'abandon' });
    tab.webview.receive({ type: 'abandon', reason: 'Then this one' });
    await expect(answer).resolves.toBe('Then this one');
  });

  it('with a probe, the test answers through the same handler, and the probe lets go when the tab closes', async () => {
    const probe = new WebviewProbe();
    const { answer, tab } = open(probe);
    expect(probe.toConfirmation({ type: 'abandon', reason: 'From the probe' })).toBe(true);
    await expect(answer).resolves.toBe('From the probe');
    expect(tab.disposed).toBe(true);
    expect(probe.toConfirmation({ type: 'back' })).toBe(false);
  });
});

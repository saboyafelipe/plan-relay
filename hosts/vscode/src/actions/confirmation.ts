// The give-up confirmation in a webview tab: opens the core/panel page, waits for "Go back" or
// "Abandon" with the reason, and closes the tab. Closing the tab counts as "Go back".
import * as vscode from 'vscode';
import { stringsFor, type Strings } from '@plan-relay/i18n';
import { confirmationDocument, isConfirmationReply, confirmationHtml, confirmationTitle, type ConfirmationData } from '@plan-relay/panel';
import { createNonce } from '../panel';
import type { WebviewProbe } from '../webview-probe';

/**
 * Shows the confirmation and returns the "Abandon" reason, or `undefined` ("Go back", Esc or the tab closed). With a
 * `probe` (Test mode only), the integration tests can answer for the page through the same handler.
 */
export function confirmInTab(
  extensionUri: vscode.Uri,
  data: ConfirmationData,
  strings: Strings = stringsFor(),
  probe?: WebviewProbe,
): Promise<string | undefined> {
  const dist = vscode.Uri.joinPath(extensionUri, 'dist');
  const title = confirmationTitle(data.preview, strings);
  const tab = vscode.window.createWebviewPanel('planRelay.giveUp', title, vscode.ViewColumn.Active, {
    enableScripts: true,
    localResourceRoots: [dist],
  });
  const w = tab.webview;
  w.html = confirmationDocument(
    {
      nonce: createNonce(),
      script: String(w.asWebviewUri(vscode.Uri.joinPath(dist, 'confirmation.js'))),
      style: String(w.asWebviewUri(vscode.Uri.joinPath(dist, 'panel.css'))),
      origin: w.cspSource,
    },
    title,
    confirmationHtml(data, strings),
    strings,
  );
  return new Promise((resolveFn) => {
    let doneTask = false;
    const receive = (m: unknown): Promise<void> => {
      if (isConfirmationReply(m)) finished(m.type === 'abandon' ? m.reason : undefined);
      return Promise.resolve();
    };
    const finished = (reason: string | undefined) => {
      if (doneTask) return;
      doneTask = true;
      probe?.confirmationClosed(receive);
      resolveFn(reason);
      tab.dispose();
    };
    w.onDidReceiveMessage((m: unknown) => void receive(m));
    tab.onDidDispose(() => finished(undefined));
    probe?.confirmationOpened(receive);
  });
}

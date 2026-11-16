import { randomBytes } from 'node:crypto';
import type * as vscode from 'vscode';
import { stringsFor, type Strings } from '@plan-relay/i18n';
import { panelDocument } from '@plan-relay/panel';

/** Random nonce to authorize only the extension's own script. */
export function createNonce(): string {
  return randomBytes(16).toString('base64');
}

/** The panel webview's HTML: the core/panel document with the nonce, the webview URIs and the language of `strings`. */
export function panelHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  uri: typeof vscode.Uri,
  strings: Strings = stringsFor(),
): string {
  return panelDocument(
    {
      nonce: createNonce(),
      script: String(webview.asWebviewUri(uri.joinPath(extensionUri, 'dist', 'webview.js'))),
      style: String(webview.asWebviewUri(uri.joinPath(extensionUri, 'dist', 'panel.css'))),
      origin: webview.cspSource,
    },
    strings,
  );
}

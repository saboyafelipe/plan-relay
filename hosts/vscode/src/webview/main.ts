// Webview script: wires the core/panel page to the VS Code webview channel.
import { stringsFor } from '@plan-relay/i18n';
import { bindPanel, type Saved, type WebviewMessage } from '@plan-relay/panel';

interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(status: Saved): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

// The extension writes the language it chose into the document's `lang` (panel.ts); the page uses the same table.
const strings = stringsFor(document.documentElement.lang);

bindPanel(
  document.getElementById('panel') as HTMLElement,
  {
    send: (message) => vscode.postMessage(message),
    onReceive: (handle) => {
      const listener = (event: MessageEvent): void => handle(event.data);
      window.addEventListener('message', listener);
      return () => window.removeEventListener('message', listener);
    },
    readSaved: () => vscode.getState(),
    save: (status) => vscode.setState(status),
  },
  strings,
  // "Collapse all", "Refresh" and the plugin status live in the view title bar.
  { actionsInRow: false },
);

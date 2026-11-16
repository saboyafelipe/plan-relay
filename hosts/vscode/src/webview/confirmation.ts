// Give-up confirmation script: wires the core/panel page to the VS Code webview channel.
import { bindConfirmation, type ConfirmationReply } from '@plan-relay/panel';

interface VsCodeApi {
  postMessage(message: ConfirmationReply): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
bindConfirmation(document.getElementById('confirmation') as HTMLElement, (r) => vscode.postMessage(r));

import { describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { panelHtml } from './panel';

const uri = {
  joinPath: (base: { path: string }, ...parts: string[]) => ({ path: [base.path, ...parts].join('/') }),
} as unknown as typeof vscode.Uri;
const webview = {
  cspSource: 'vscode-resource:',
  asWebviewUri: (u: { path: string }) => `vscode-resource:${u.path}`,
} as unknown as vscode.Webview;

describe('panelHtml', () => {
  const html = panelHtml(webview, { path: '/ext' } as unknown as vscode.Uri, uri);
  const csp = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? '';

  it('has a restrictive CSP, with a nonce and no inline or eval', () => {
    expect(csp).toContain("default-src 'none'");
    expect(csp).toMatch(/script-src 'nonce-[A-Za-z0-9+/=]+'/);
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
  });

  it('the script loads with the same nonce as the CSP', () => {
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(html).toContain(`<script nonce="${nonce}" src="vscode-resource:/ext/dist/webview.js">`);
  });

  it("the style is the bundled CSS (core/panel with the VS Code theme) and the origin is the webview's", () => {
    expect(html).toContain('<link rel="stylesheet" href="vscode-resource:/ext/dist/panel.css">');
    expect(csp).toContain('style-src vscode-resource:');
  });

  it('each HTML gets a new nonce', () => {
    const other = panelHtml(webview, { path: '/ext' } as unknown as vscode.Uri, uri);
    expect(/'nonce-([^']+)'/.exec(other)?.[1]).not.toBe(/'nonce-([^']+)'/.exec(csp)?.[1]);
  });
});

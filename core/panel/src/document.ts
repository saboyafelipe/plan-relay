// The HTML document that hosts the panel, with a closed CSP: only the script with the nonce and the resources of the
// origin the host indicates. The nonce and the addresses come from the host (VS Code webview, app page).
import { stringsFor, type Strings } from '@plan-relay/i18n';
import { escapeHtml } from './util';

export interface DocumentResources {
  /** Random for each document; authorizes only the panel script. */
  nonce: string;
  /** Address of the page script (the one that calls `bindPanel`). */
  script: string;
  /** Address of the stylesheet (the panel CSS with the `--pr-*` variables defined by the host). */
  style: string;
  /** The origin of the resources in the CSP (`style-src` and `img-src`). */
  origin: string;
}

/**
 * The page both documents share: the CSP, the stylesheet and the script with the nonce around a `<main>`. `base-uri`
 * and `form-action` do not fall back to `default-src`, so they are closed by name.
 */
function page({ nonce, script, style, origin }: DocumentResources, language: string, title: string, main: string): string {
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src ${origin}`,
    `img-src ${origin}`,
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="${escapeHtml(language)}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${style}">
<title>${escapeHtml(title)}</title>
</head>
<body>
${main}
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}

/**
 * The document in the language of `strings` (English without them): the `lang` of the `<html>` is the table language, and the
 * page (`bindPanel`) chooses the same table from it.
 */
export function panelDocument(resources: DocumentResources, strings: Strings = stringsFor()): string {
  const main = `<main id="panel">
<p class="empty">${escapeHtml(strings.t('document.reading'))}</p>
</main>`;
  return page(resources, strings.language, strings.t('document.title'), main);
}

/**
 * The give-up confirmation document: the same CSP and the same stylesheet as the panel, the body already
 * ready (`confirmationHtml`) and the script that binds it (`bindConfirmation`).
 */
export function confirmationDocument(resources: DocumentResources, title: string, body: string, strings: Strings = stringsFor()): string {
  const main = `<main id="confirmation" class="page-cf">
${body}
</main>`;
  return page(resources, strings.language, title, main);
}

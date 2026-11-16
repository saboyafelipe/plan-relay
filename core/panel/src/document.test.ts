import { confirmationDocument, panelDocument } from './document';

const resources = { nonce: 'abc123+/=', script: 'res:/p/webview.js', style: 'res:/p/painel.css', origin: 'res:' };
const cspOf = (html: string): string => /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? '';
const EXPECTED_CSP = "default-src 'none'; script-src 'nonce-abc123+/='; style-src res:; img-src res:; base-uri 'none'; form-action 'none'";

describe('panelDocument', () => {
  const html = panelDocument(resources);
  const csp = cspOf(html);

  it('the CSP only allows the script with the nonce and the resources of the given origin, without inline or eval', () => {
    expect(csp).toBe(EXPECTED_CSP);
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
  });

  it('the script and the style come from the given addresses, the script with the same nonce', () => {
    expect(html).toContain('<script nonce="abc123+/=" src="res:/p/webview.js"></script>');
    expect(html).toContain('<link rel="stylesheet" href="res:/p/painel.css">');
  });

  it('the page has the root where the panel is drawn', () => {
    expect(html).toContain('<main id="panel">');
  });
});

describe('confirmationDocument', () => {
  it('has the same CSP as the panel', () => {
    expect(cspOf(confirmationDocument(resources, 'Title', '<p>body</p>'))).toBe(EXPECTED_CSP);
  });
});

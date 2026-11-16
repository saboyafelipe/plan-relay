import { stringsFor } from '@plan-relay/i18n';
import type { GiveUpPreview } from '@plan-relay/reader';
import { isConfirmationReply, confirmationHtml, replyOf, confirmationTitle } from './confirmation';
import { confirmationDocument } from './document';

const PT = stringsFor('pt-BR');
const q = (id: string, depth: number, o: Partial<GiveUpPreview['falls'][number]> = {}) => ({
  id,
  title: `Título de ${id}`,
  status: 'ready',
  phase: id.startsWith('F2') ? 'phase-2-meio' : 'phase-1-base',
  parent: null,
  depth,
  also_depends_on: [],
  ...o,
});
const PREVIEW: GiveUpPreview = {
  root: 'F1-01',
  falls: [q('F1-01', 0), q('F2-01', 1), q('F2-02', 2, { also_depends_on: ['F1-02'] }), q('F2-03', 2, { status: 'draft' }), q('F1-09', 1)],
  abandoned_phases: ['phase-2-meio'],
};
const PHASES = { 'phase-1-base': 'Base', 'phase-2-meio': 'Meio' };

describe('confirmationHtml', () => {
  const html = confirmationHtml({ preview: PREVIEW, phases: PHASES }, PT);

  it('alarm: the total in the title, the abandoned phases highlighted, the button with the number and «Voltar» first', () => {
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain(`<h1 id="cf-title">${PT.t('giveup.title', 'F1-01', 5)}</h1>`);
    expect(html).toContain(`<ul class="cf-phases"><li>${PT.t('giveup.phase', 'Meio').replace(/«|»/g, (c) => c)}</li></ul>`);
    expect(html).toMatch(
      /<button type="button" class="btn pri" data-action="back">Voltar<\/button><button type="button" class="btn cf-danger" data-action="abandon">Abandonar 5 tasks<\/button>/,
    );
  });

  it('the graph in nested lists by depth, with phase, draft and «também depende de»', () => {
    const graph = /<div class="cf-graph">(.*?)<\/div>/s.exec(html)?.[1] ?? '';
    const skeleton = graph.replace(/<li>.*?(?=<ul>|<\/li>)/g, (m) => `<li>${/class="id">([^<]+)/.exec(m)?.[1]}`);
    expect(skeleton).toBe('<ul><li>F1-01<ul><li>F2-01<ul><li>F2-02</li><li>F2-03</li></ul></li><li>F1-09</li></ul></li></ul>');
    expect(graph).toContain('<span class="cf-phase">Meio</span>');
    expect(graph).toContain('<span class="cf-also">também depende de F1-02</span>');
    expect(graph).toMatch(/F2-03.*<span class="cf-tag">rascunho<\/span>/);
  });

  it('the reason field has a label and the error «O motivo não é válido.» hidden', () => {
    expect(html).toContain(`<label class="cf-label" for="cf-reason">${PT.t('giveup.reasonQuestion', 'F1-01')}</label>`);
    expect(html).toMatch(/<p id="cf-reason-error" class="cf-error" role="alert" hidden>O motivo não é válido\.<\/p>/);
  });

  it('only the root: title and button in the singular', () => {
    const so = { root: 'F1-01', falls: [q('F1-01', 0)], abandoned_phases: [] };
    expect(confirmationTitle(so, PT)).toBe(PT.t('giveup.titleOnly', 'F1-01'));
    expect(confirmationHtml({ preview: so, phases: PHASES }, PT)).toContain('>Abandonar a task</button>');
  });

  it('escapes titles and IDs', () => {
    const badPreview = { root: 'F1-01', falls: [q('F1-01', 0, { title: '<b>x</b>' })], abandoned_phases: [] };
    expect(confirmationHtml({ preview: badPreview, phases: PHASES }, PT)).not.toContain('<b>');
  });

  it('the document carries the closed CSP and the nonce on the script', () => {
    const doc = confirmationDocument({ nonce: 'n1', script: 's.js', style: 'e.css', origin: 'o:' }, 't', html, PT);
    expect(doc).toContain("script-src 'nonce-n1'");
    expect(doc).toContain('<script nonce="n1" src="s.js"></script>');
  });
});

describe('replyOf', () => {
  it('back goes back; abandon only with a valid reason', () => {
    expect(replyOf('back', '')).toEqual({ type: 'back' });
    expect(replyOf('abandon', 'aaa bbb 111 ---')).toBe('invalid-reason');
    expect(replyOf('abandon', '   ')).toBe('invalid-reason');
    expect(replyOf('abandon', 'Sem máquina Windows disponível')).toEqual({
      type: 'abandon',
      reason: 'Sem máquina Windows disponível',
    });
    expect(replyOf(undefined, 'x')).toBeUndefined();
  });

  it('isConfirmationReply validates what the page sends', () => {
    expect(isConfirmationReply({ type: 'back' })).toBe(true);
    expect(isConfirmationReply({ type: 'abandon', reason: 'x' })).toBe(true);
    for (const x of [null, {}, { type: 'abandon' }, { type: 'abandon', reason: 1 }, { type: 'outra' }])
      expect(isConfirmationReply(x)).toBe(false);
  });
});

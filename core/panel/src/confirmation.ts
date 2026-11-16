// The give-up confirmation: a page of its own, opened by the host in a tab (in
// VS Code, a webview panel), because the native modal does not show the graph indentation and makes the applying button the
// default. In an alarming tone: the total and the phases that end up entirely abandoned stand out, the graph is in nested
// lists (the screen reader announces the level), the reason is validated and «Back» has focus; Esc and Enter do not apply.
import { stringsFor, type Strings } from '@plan-relay/i18n';
import { isValidReason, type GiveUpPreview, type GiveUpFall } from '@plan-relay/reader';
import { statusIcon } from './icons';
import { button, escapeHtml } from './util';

export interface ConfirmationData {
  preview: GiveUpPreview;
  /** The title of each phase, by `dir`; a phase without a title shows its `dir`. */
  phases: Readonly<Record<string, string>>;
}

/** Confirmation → host. */
export type ConfirmationReply = { type: 'back' } | { type: 'abandon'; reason: string };

export function isConfirmationReply(x: unknown): x is ConfirmationReply {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  const m = x as Record<string, unknown>;
  return m.type === 'back' || (m.type === 'abandon' && typeof m.reason === 'string');
}

/** The title of the tab and of the dialog: «Give up <ID> abandons 5 tasks». */
export function confirmationTitle(preview: GiveUpPreview, x: Strings = stringsFor()): string {
  const n = preview.falls.length;
  return n === 1 ? x.t('giveup.titleOnly', preview.root) : x.t('giveup.title', preview.root, n);
}

function item(q: GiveUpFall, phases: ConfirmationData['phases'], x: Strings): string {
  const phase = phases[q.phase] ?? q.phase;
  const draft = q.status === 'draft' ? ` <span class="cf-tag">${escapeHtml(x.t('detail.status-draft'))}</span>` : '';
  const also = q.also_depends_on.length
    ? ` <span class="cf-also">${escapeHtml(x.t('task.giveupAlso', q.also_depends_on.join(', ')))}</span>`
    : '';
  const statusMark = `<span class="cf-ic">${statusIcon(q.status === 'draft' ? 'draft' : 'available')}</span>`;
  const text = `<span class="id">${escapeHtml(q.id)}</span> <span class="cf-tt">${escapeHtml(q.title)}</span>`;
  return `${statusMark}${text} <span class="cf-phase">${escapeHtml(phase)}</span>${draft}${also}`;
}

/** The graph in pre-order as nested lists: each task inside the list of the parent it falls with. */
function graph(falls: readonly GiveUpFall[], phases: ConfirmationData['phases'], x: Strings): string {
  let html = '';
  let tier = -1;
  for (const q of falls) {
    if (q.depth > tier) html += '<ul>'.repeat(q.depth - tier);
    else html += '</li>' + '</ul></li>'.repeat(tier - q.depth);
    html += `<li>${item(q, phases, x)}`;
    tier = q.depth;
  }
  return html + '</li>' + '</ul></li>'.repeat(tier) + '</ul>';
}

/** The body of the confirmation page (the host puts it in a document with its own CSP). */
export function confirmationHtml({ preview, phases }: ConfirmationData, x: Strings = stringsFor()): string {
  const n = preview.falls.length;
  const abandoned = preview.abandoned_phases.map((f) => `<li>${escapeHtml(x.t('giveup.phase', phases[f] ?? f))}</li>`).join('');
  const highlight = abandoned ? `<ul class="cf-phases">${abandoned}</ul>` : '';
  const alarm = `<svg class="cf-alarm" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l6.6 11.7H1.4z"/><path d="M8 6.3v3.4M8 11.6h0"/></svg>`;
  const giveUp = n === 1 ? x.t('giveup.buttonOnly') : x.t('giveup.button', n);
  const back = button('class="btn pri" data-action="back"', escapeHtml(x.t('giveup.back')));
  const abandon = button('class="btn cf-danger" data-action="abandon"', escapeHtml(giveUp));
  return `<section class="cf" role="alertdialog" aria-labelledby="cf-title" aria-describedby="cf-summary">
<header class="cf-head">${alarm}<h1 id="cf-title">${escapeHtml(confirmationTitle(preview, x))}</h1></header>
<div id="cf-summary" class="cf-summary">${highlight}<p>${escapeHtml(x.t('giveup.after', preview.root))}</p></div>
<div class="cf-graph">${graph(preview.falls, phases, x)}</div>
<label class="cf-label" for="cf-reason">${escapeHtml(x.t('giveup.reasonQuestion', preview.root))}</label>
<input id="cf-reason" class="cf-reason" type="text" autocomplete="off" spellcheck="false" aria-describedby="cf-reason-error">
<p id="cf-reason-error" class="cf-error" role="alert" hidden>${escapeHtml(x.t('task.invalidReason'))}</p>
<div class="cf-buttons">${back}${abandon}</div>
</section>`;
}

/** What a click (or Esc) answers: go back, abandon with the reason, or the refused reason (the page shows the error). */
export function replyOf(action: string | undefined, reason: string): ConfirmationReply | 'invalid-reason' | undefined {
  if (action === 'back') return { type: 'back' };
  if (action !== 'abandon') return undefined;
  return isValidReason(reason) ? { type: 'abandon', reason } : 'invalid-reason';
}

/** Binds the page: «Back» has focus, Esc goes back, Enter in the field does not apply, «Abandon» validates the reason. */
export function bindConfirmation(root: HTMLElement, send: (r: ConfirmationReply) => void): void {
  const field = root.querySelector<HTMLInputElement>('#cf-reason');
  const error = root.querySelector<HTMLElement>('#cf-reason-error');
  let answered = false;
  const reply = (r: ConfirmationReply) => {
    if (answered) return;
    answered = true;
    send(r);
  };
  const showError = (shown: boolean) => {
    if (error) error.hidden = !shown;
    field?.setAttribute('aria-invalid', String(shown));
  };
  root.addEventListener('click', (event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>('[data-action]');
    const r = replyOf(target?.dataset.action, field?.value ?? '');
    if (r === undefined) return;
    if (r === 'invalid-reason') {
      showError(true);
      field?.focus();
      return;
    }
    reply(r);
  });
  field?.addEventListener('input', () => {
    if (error && !error.hidden && isValidReason(field.value)) showError(false);
  });
  root.ownerDocument.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      reply({ type: 'back' });
    } else if (event.key === 'Enter' && event.target === field) {
      // The default is to go back: Enter in the reason does not apply; applying is only the button.
      event.preventDefault();
    }
  });
  // No scrolling: with a long graph, «Back» sits at the bottom and the alarm at the top has to be what is seen first.
  root.querySelector<HTMLElement>('[data-action="back"]')?.focus({ preventScroll: true });
}

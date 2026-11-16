// @vitest-environment happy-dom
import { stringsFor } from '@plan-relay/i18n';
import { bindConfirmation, confirmationHtml, type ConfirmationReply } from './confirmation';

const PREVIEW = {
  root: 'F1-01',
  falls: [{ id: 'F1-01', title: 'Root', status: 'ready', phase: 'phase-1-base', parent: null, depth: 0, also_depends_on: [] }],
  abandoned_phases: [],
};

/** The page drawn by `confirmationHtml` and bound, as the host shows it. */
function mount(): { root: HTMLElement; sent: ConfirmationReply[] } {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  root.innerHTML = confirmationHtml({ preview: PREVIEW, phases: {} }, stringsFor('en'));
  document.body.append(root);
  const sent: ConfirmationReply[] = [];
  bindConfirmation(root, (r) => sent.push(r));
  return { root, sent };
}

function typeReason(root: HTMLElement, text: string): HTMLInputElement {
  const field = root.querySelector<HTMLInputElement>('input')!;
  field.value = text;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  return field;
}

function clickAbandon(root: HTMLElement): void {
  root.querySelector<HTMLElement>('[data-action="abandon"]')!.click();
}

describe('bindConfirmation on the drawn page', () => {
  it('abandons with the reason typed in the field', () => {
    const { root, sent } = mount();
    typeReason(root, 'No Windows machine available');
    clickAbandon(root);
    expect(sent).toEqual([{ type: 'abandon', reason: 'No Windows machine available' }]);
  });

  it('shows the error on an invalid reason, marks the field and hides the error once the reason is valid', () => {
    const { root, sent } = mount();
    const field = typeReason(root, 'aaa');
    clickAbandon(root);
    const error = root.querySelector<HTMLElement>('[role="alert"]')!;
    expect(sent).toEqual([]);
    expect(error.hidden).toBe(false);
    expect(field.getAttribute('aria-invalid')).toBe('true');
    typeReason(root, 'A real reason');
    expect(error.hidden).toBe(true);
    expect(field.getAttribute('aria-invalid')).toBe('false');
  });
});

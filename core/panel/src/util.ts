// Small helpers shared across the panel. Nothing from the render or the strings: any module, the give-up confirmation
// included, can use them without pulling those into its bundle. `isRecord` is defined once, in the reader.
import { isRecord } from '@plan-relay/reader';

export { isRecord } from '@plan-relay/reader';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** The text safe to put in HTML, in content and in quoted attributes. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** A `<button type="button">` with the attributes and the content, both already HTML (escaped by the caller). */
export function button(attributes: string, content: string): string {
  return `<button type="button" ${attributes}>${content}</button>`;
}

/** The accessible name and the tooltip of an icon button, from one label already escaped. */
export function labelled(label: string): string {
  return `aria-label="${label}" title="${label}"`;
}

/**
 * An HTML `id` built from any text, the same text always giving the same `id` and two texts never the same one: each
 * character outside `[A-Za-z0-9-]` (the `_` included) becomes `_<hex code>_`. Safe in an attribute without escaping.
 */
export function domId(prefix: string, text: string): string {
  return `${prefix}-${text.replace(/[^A-Za-z0-9-]/gu, (c) => `_${(c.codePointAt(0) ?? 0).toString(16)}_`)}`;
}

/** `x` when it is a plain object, else an empty one: for reading what may be missing or of another shape. */
export function recordOf(x: unknown): Record<string, unknown> {
  return isRecord(x) ? x : {};
}

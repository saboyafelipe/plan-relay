// Panel icons as inline SVG: no font, no image and no host (the panel is drawn for more than one host; see ARCHITECTURE.md),
// and so nothing in the Content Security Policy. Each one is decorative (`aria-hidden`: the text beside it says
// what it is) and has no color of its own: the stroke is `currentColor`, and the status color comes from the CSS through the `status-<group>` class.
import type { TaskGroup } from './input';

const OPEN = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false"';

const ACTION = {
  play: '<path class="fill" d="M5 3.5v9l7-4.5z"/>',
  info: '<circle cx="8" cy="8" r="6"/><path d="M8 7.5V11M8 5h0"/>',
  file: '<path d="M4 2h5l3 3v9H4zM9 2v3h3"/>',
  mapAction: '<path d="M2 4l4-2 4 2 4-2v10l-4 2-4-2-4 2zM6 2v10M10 4v10"/>',
  log: '<path d="M3 3h10M3 6.5h10M3 10h7M3 13.5h5"/>',
  more: '<circle class="fill" cx="4" cy="8" r=".9"/><circle class="fill" cx="8" cy="8" r=".9"/><circle class="fill" cx="12" cy="8" r=".9"/>',
  copy: '<rect x="5" y="5" width="8" height="9" rx="1"/><path d="M3 11V3a1 1 0 0 1 1-1h6"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  trash: '<path d="M3 4h10M6 4V2.5h4V4M4.5 4l.5 10h6l.5-10"/>',
  filter: '<path d="M2.5 3h11l-4.2 5v4.5L6.7 14V8z"/>',
  collapse: '<path d="M4 6l4 4 4-4"/>',
  // The VS Code «collapse-all»: a square with a dash.
  'collapse-all': '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M5.5 8h5"/>',
  search: '<circle cx="7" cy="7" r="4"/><path d="M10 10l3.5 3.5"/>',
  // «Refresh»: an arc arrow, with the tip at the end.
  refresh: '<path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v2.8h-2.8"/>',
  // The panel tabs: «Now» is the pulse of what is running, «Plans» a task list, «Ideas» a light bulb.
  now: '<path d="M1.5 8h3l2-4.5 3 9 2-4.5h3"/>',
  plans: '<path d="M2 4l1.2 1.2L5.5 3M2 8.5l1.2 1.2 2.3-2.2M7.5 4.2H14M7.5 8.7H14M7.5 13H14M2.5 13h2"/>',
  ideas: '<path d="M8 1.8a4.2 4.2 0 0 0-2.5 7.6v2.1h5V9.4A4.2 4.2 0 0 0 8 1.8zM6 13.5h4"/>',
  // The ideas card: «New idea» is a +, «Open folder» a folder and «Refine» a file.
  new: '<path d="M8 3v10M3 8h10"/>',
  folder: '<path d="M2 4.5h4l1.2 1.5H14v7H2z"/>',
  refine: '<path d="M3 13l7-7M9 3l4 4M11 2l3 3-1.5 1.5-3-3z"/>',
  giveUp: '<circle cx="8" cy="8" r="6"/><path d="M5 8h6"/>',
  reopen: '<path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v2.8h2.8"/>',
} as const;

const STATUS: Record<TaskGroup, string> = {
  done: '<circle class="halo" cx="8" cy="8" r="6.5"/><path d="M5 8.2l2 2 4-4.4"/>',
  'in-progress': '<circle cx="8" cy="8" r="6"/><path class="fill" d="M8 2a6 6 0 0 1 0 12z"/>',
  blocked: '<circle cx="8" cy="8" r="6"/><path d="M8 5v3.2l2 1.3"/>',
  owner: '<circle cx="8" cy="6" r="2.5"/><path d="M3.5 14c.5-2.5 2.3-3.8 4.5-3.8s4 1.3 4.5 3.8"/>',
  draft: '<circle cx="8" cy="8" r="6" stroke-dasharray="2 2"/>',
  cancelled: '<circle cx="8" cy="8" r="6"/><path d="M5 11l6-6"/>',
  // The × of a give-up: the cancelled one has a single dash (replaced by another), the abandoned one two (the owner gave up).
  abandoned: '<circle cx="8" cy="8" r="6"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5"/>',
  invalid: '<path d="M8 2.2l6.3 11H1.7z"/><path d="M8 6.5v3.2M8 11.6h0"/>',
  available: '<circle cx="8" cy="8" r="6"/>',
};

export type IconName = keyof typeof ACTION;

export const ACTION_ICONS = Object.keys(ACTION) as IconName[];
export const STATUS_ICONS = Object.keys(STATUS) as TaskGroup[];

/** The icon of an action (play, info, file, ...), with the surrounding text color. */
export function icon(name: IconName): string {
  return `<svg ${OPEN} class="ic ic-${name}">${ACTION[name]}</svg>`;
}

export type SegmentColor = 'ok' | 'run' | 'wait' | 'owner' | 'draft' | 'free';
export interface Segment {
  color: SegmentColor;
  n: number;
}

const SEGMENT_COLORS: readonly SegmentColor[] = ['ok', 'run', 'wait', 'owner', 'draft', 'free'];

/**
 * The plan stacked bar: a 100 by 6 SVG that stretches to the row width. The panel CSP does not allow
 * inline `style`, so the proportions go in attributes (`x`, `width`) and the color comes from the `seg-<color>` class.
 * Empty or invalid segments disappear; with none, only the background.
 */
export function stackedBar(segments: readonly Segment[]): string {
  const valid = segments.filter((s) => SEGMENT_COLORS.includes(s.color) && Number.isFinite(s.n) && s.n > 0);
  const total = valid.reduce((sum, s) => sum + s.n, 0);
  let x = 0;
  const rectangles = valid.map((s) => {
    const width = (s.n / total) * 100;
    const r = `<rect class="seg-${s.color}" x="${+x.toFixed(2)}" y="0" width="${+width.toFixed(2)}" height="6"/>`;
    x += width;
    return r;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" class="stacked-bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true" focusable="false">${rectangles.join('')}</svg>`;
}

/** The progress ring (0 to 1, clamped outside that): the arc is a circle with `pathLength="100"` and `stroke-dasharray`. */
export function ring(fraction: number): string {
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const pct = +(f * 100).toFixed(2);
  const arc = `<circle class="ring-arc" cx="8" cy="8" r="6" pathLength="100" stroke-dasharray="${pct} 100" transform="rotate(-90 8 8)"/>`;
  return `<svg ${OPEN} class="ring"><circle class="ring-background" cx="8" cy="8" r="6"/>${arc}</svg>`;
}

/** The icon of a task status; the color comes from the `status-<group>` class in the CSS. An unknown group becomes the empty circle. */
export function statusIcon(group: TaskGroup): string {
  return `<svg ${OPEN} class="ic ic-status status-${group}">${STATUS[group] ?? STATUS.available}</svg>`;
}

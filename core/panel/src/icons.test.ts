import type { TaskGroup } from './input';
import { ACTION_ICONS, STATUS_ICONS, ring, stackedBar, icon, statusIcon } from './icons';

const GROUPS: TaskGroup[] = ['in-progress', 'available', 'owner', 'blocked', 'draft', 'done', 'cancelled', 'invalid'];

describe('icons', () => {
  it('the «free» segment (available) enters the bar, so the proportions apply to the whole plan', () => {
    const svg = stackedBar([
      { color: 'ok', n: 1 },
      { color: 'free', n: 3 },
    ]);
    expect(svg).toContain('<rect class="seg-free" x="25" y="0" width="75" height="6"/>');
  });

  it('covers the status and action icons', () => {
    expect([...STATUS_ICONS].sort()).toEqual(
      ['abandoned', 'available', 'blocked', 'cancelled', 'done', 'draft', 'in-progress', 'invalid', 'owner'].sort(),
    );
    expect([...ACTION_ICONS].sort()).toEqual(
      [
        'now',
        'refresh',
        'ideas',
        'plans',
        'file',
        'search',
        'copy',
        'log',
        'close',
        'filter',
        'info',
        'trash',
        'more',
        'mapAction',
        'play',
        'collapse',
        'collapse-all',
        // The ideas card.
        'new',
        'folder',
        'refine',
        // Give up and reopen.
        'giveUp',
        'reopen',
      ].sort(),
    );
  });

  it('every task group has a status icon', () => {
    for (const g of GROUPS) expect(STATUS_ICONS).toContain(g);
  });

  it('each icon is an SVG with aria-hidden and no fixed color', () => {
    const all = [...ACTION_ICONS.map((n) => icon(n)), ...STATUS_ICONS.map((g) => statusIcon(g))];
    expect(all).toHaveLength(ACTION_ICONS.length + STATUS_ICONS.length);
    for (const svg of all) {
      expect(svg).toMatch(/^<svg [^>]*aria-hidden="true"/);
      expect(svg).toMatch(/<\/svg>$/);
      expect(svg).toContain('viewBox="0 0 16 16"');
      expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(svg).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/i);
      expect(svg).not.toContain('style=');
      expect(svg).not.toMatch(/(?:fill|stroke)="(?!none|currentColor)/);
    }
  });

  it('the status icon carries the status class, so the color comes from the CSS', () => {
    for (const g of GROUPS) expect(statusIcon(g)).toContain(`class="ic ic-status status-${g}"`);
    expect(icon('play')).toContain('class="ic ic-play"');
  });

  it('the stacked bar puts the proportions in attributes, never in style (the CSP does not allow it)', () => {
    const svg = stackedBar([
      { color: 'ok', n: 3 },
      { color: 'run', n: 1 },
      { color: 'wait', n: 0 },
      { color: 'draft', n: Number.NaN },
    ]);
    expect(svg).toContain('class="stacked-bar"');
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).not.toContain('style=');
    expect(svg).toContain('<rect class="seg-ok" x="0" y="0" width="75" height="6"/>');
    expect(svg).toContain('<rect class="seg-run" x="75" y="0" width="25" height="6"/>');
    expect(svg).not.toContain('seg-wait');
    expect(svg).not.toContain('seg-draft');
    expect(stackedBar([])).not.toContain('<rect');
    expect(stackedBar([{ color: 'x' as 'ok', n: 2 }])).not.toContain('<rect');
  });

  it('the ring clamps the fraction and carries the arc in stroke-dasharray', () => {
    expect(ring(0.25)).toContain('stroke-dasharray="25 100"');
    expect(ring(2)).toContain('stroke-dasharray="100 100"');
    expect(ring(-1)).toContain('stroke-dasharray="0 100"');
    expect(ring(Number.NaN)).toContain('stroke-dasharray="0 100"');
    expect(ring(0.5)).toMatch(/^<svg [^>]*aria-hidden="true"[^>]*class="ring"/);
    expect(ring(0.5)).not.toContain('style=');
  });

  it('an unknown status falls back to the empty circle, without throwing', () => {
    expect(statusIcon('nada' as TaskGroup)).toBe(statusIcon('available').replace('status-available', 'status-nada'));
  });
});

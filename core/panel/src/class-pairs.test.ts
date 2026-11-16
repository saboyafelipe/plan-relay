import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// A class renamed on one side only (the HTML in TypeScript or the stylesheet) fails silently: the rule stops applying and
// nothing breaks. This test requires the pair in both directions.
const dir = import.meta.dirname;
const read = (name: string): string => readFileSync(join(dir, name), 'utf8');
// The render is split by region (render.ts and render-<region>.ts): every one of them emits classes.
const renderFiles = readdirSync(dir).filter((name) => /^render(-[a-z]+)?\.ts$/.test(name));
const sources = [...renderFiles, 'page.ts', 'page-dom.ts', 'controller.ts', 'confirmation.ts', 'document.ts', 'icons.ts'].map(read);
const css = read('panel.css').replace(/\/\*[\s\S]*?\*\//g, '');

/** Classes assembled at run time (`status-${…}`): the stylesheet may carry any name with these prefixes. */
const DYNAMIC_PREFIXES = ['status-', 'idea-color-', 'seg-', 'plugin-', 'group-', 'ic-'];
/** Emitted from a template with a computed suffix (`depth-${Math.min(depth, 2)}`): listed by name. */
const COMPUTED = ['depth-1', 'depth-2'];

/** Emitted as a marker (structure the tests and the page read) and with no rule of their own. */
const MARKERS = [
  'abandoned-block',
  'cf-tt',
  'content',
  'done-block',
  'expanded',
  'ideas-card',
  'no-result',
  'opened',
  'phase',
  'tab-panel',
];

const HOLE = '\u0001';

function tokens(text: string): string[] {
  // A name cut by a hole and ending in «-» is a prefix of a dynamic class; the rest is a plain name next to the hole.
  return text
    .replace(/\$\{[^}]*\}/g, HOLE)
    .split(/\s+/)
    .flatMap((t) => t.split(HOLE))
    .filter((t) => t !== '' && !t.endsWith('-'));
}

/** The class names a source emits: attributes, `classes` arrays, `classes.push` and `classList` calls. */
function emitted(source: string): Set<string> {
  const found = new Set<string>();
  const add = (text: string): void => tokens(text).forEach((t) => found.add(t));
  for (const m of source.matchAll(/class="([^"]*)"/g)) {
    const attribute = m[1] ?? '';
    add(attribute);
    // The quoted pieces inside `${cond ? ' danger' : ''}` are class names too.
    for (const e of attribute.matchAll(/\$\{([^}]*)\}/g)) for (const s of (e[1] ?? '').matchAll(/'([^']*)'/g)) add(s[1] ?? '');
  }
  // The whole line of a `classes` array or push: the literals in it, except the ones a comparison reads (`e === 'mapped'`).
  for (const m of source.matchAll(/\w*[cC]lasses(?::|\s*=|\.push)[^\n]*/g)) {
    for (const s of m[0].matchAll(/(?<!== )(['`])((?:(?!\1).)*)\1/g)) add(s[2] ?? '');
  }
  for (const m of source.matchAll(/classList\.(?:add|remove|toggle)\(\s*'([^']*)'/g)) add(m[1] ?? '');
  return found;
}

const emittedAll = new Set(sources.flatMap((s) => [...emitted(s)]));
const emittedStatic = [...emittedAll].filter((c) => !c.includes(HOLE) && /^[a-z][\w-]*$/.test(c));

/** The class names the stylesheet has a selector for. */
const styled = new Set<string>();
for (const m of css.matchAll(/([^{}]+)\{/g)) {
  const selector = m[1] ?? '';
  if (selector.trim().startsWith('@')) continue;
  for (const c of selector.matchAll(/\.([a-zA-Z][\w-]*)/g)) styled.add(c[1] ?? '');
}

describe('classes of the panel: HTML and panel.css as a pair', () => {
  it('finds what the panel emits', () => {
    expect(emittedStatic.length).toBeGreaterThan(50);
    expect(emittedStatic).toContain('mi');
    expect(emittedStatic).toContain('danger');
    expect(emittedStatic).toContain('above');
  });

  it('every class the code emits has a selector in panel.css', () => {
    const orphans = emittedStatic.filter((c) => !styled.has(c) && !MARKERS.includes(c) && !DYNAMIC_PREFIXES.some((p) => c.startsWith(p)));
    expect(orphans.sort()).toEqual([]);
  });

  it('every class selector in panel.css has something that emits it', () => {
    const orphans = [...styled].filter(
      (c) => !emittedAll.has(c) && !COMPUTED.includes(c) && !DYNAMIC_PREFIXES.some((p) => c.startsWith(p)),
    );
    expect(orphans.sort()).toEqual([]);
  });

  it('the computed classes are still emitted by the template', () => {
    expect(sources.some((s) => s.includes('`depth-${'))).toBe(true);
  });
});

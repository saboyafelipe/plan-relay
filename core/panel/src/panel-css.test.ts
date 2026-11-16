import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, type AtRule, type ChildNode, type Container, type Declaration, type Rule } from 'postcss';

// panel.css has no logic, but it has rules the owner asked for and that a careless tweak undoes.
// Colors and fonts come only from `--pr-*` variables, which each host defines from its theme.
// The assertions query the stylesheet as postcss parses it (rules, at-rules, declarations), not its text:
// a reformatted file, a comment or a reordered selector list does not break them.
const css = readFileSync(join(import.meta.dirname, 'panel.css'), 'utf8');
const root = parse(css);

/** The declarations of a rule or block, property → value; a property declared twice keeps the last value. */
type Declarations = Record<string, string>;

/** A selector list compared by its parts, so that line breaks and spaces between them do not matter. */
const selectorKey = (selector: string): string =>
  selector
    .split(',')
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .join(', ');

const isRule = (node: ChildNode): node is Rule => node.type === 'rule';
const isAtRule = (node: ChildNode): node is AtRule => node.type === 'atrule';
const isDeclaration = (node: ChildNode): node is Declaration => node.type === 'decl';

function declarations(container: Container): Declarations {
  const result: Declarations = {};
  for (const node of container.nodes ?? []) if (isDeclaration(node)) result[node.prop] = node.value;
  return result;
}

/** Every rule in the stylesheet, at any depth. */
function allRules(): Rule[] {
  const rules: Rule[] = [];
  root.walkRules((r) => {
    rules.push(r);
  });
  return rules;
}

/** Every declaration inside a container, at any depth. */
function allDeclarations(container: Container = root): Declaration[] {
  const result: Declaration[] = [];
  container.walkDecls((d) => {
    result.push(d);
  });
  return result;
}

/** The declarations of the first rule with exactly this selector, directly inside `scope` (the top level by default). */
function rule(selector: string, scope: Container = root): Declarations {
  const key = selectorKey(selector);
  const found = (scope.nodes ?? []).filter(isRule).find((r) => selectorKey(r.selector) === key);
  if (!found) throw new Error(`rule ${selector} is missing`);
  return declarations(found);
}

/** The declarations of the first top-level rule whose selector list includes this selector, alone or with others. */
function ruleListing(selector: string): Declarations {
  const found = (root.nodes ?? []).filter(isRule).find((r) => r.selectors.some((s) => s.trim() === selector));
  if (!found) throw new Error(`no rule lists ${selector}`);
  return declarations(found);
}

/** The first top-level at-rule with this name and these params, such as `media` and `(forced-colors: active)`. */
function block(name: string, params: string): AtRule {
  const found = (root.nodes ?? []).filter(isAtRule).find((a) => a.name === name && a.params === params);
  if (!found) throw new Error(`block @${name} ${params} is missing`);
  return found;
}

/** Whether some selector of the stylesheet, at any depth, matches. */
const someSelector = (test: (selector: string) => boolean): boolean => allRules().some((r) => r.selectors.some((s) => test(s.trim())));

const zIndex = (declared: Declarations): number => Number(declared['z-index']);

describe('panel.css', () => {
  it('does not depend on a host: no editor theme variable', () => {
    // A text check on purpose: the prefix must not appear even in a comment.
    // The prefix is assembled so that a grep for it over core/panel stays empty.
    expect(css).not.toContain(['--', 'vscode', '-'].join(''));
  });

  it('has no fixed colors: only --pr-* variables, currentColor and transparent', () => {
    const values = allDeclarations().map((d) => d.value);
    expect(values.filter((v) => /#[0-9a-f]{3,8}\b/i.test(v))).toEqual([]);
    expect(values.filter((v) => /\b(rgb|rgba|hsl|hsla)\(/i.test(v))).toEqual([]);
    const variables = values.flatMap((v) => [...v.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1] ?? ''));
    expect(variables.length).toBeGreaterThan(0);
    expect(variables.filter((v) => !v.startsWith('--pr-'))).toEqual([]);
  });

  it('does not define the variables: the host does', () => {
    expect(allDeclarations().filter((d) => d.prop.startsWith('--pr-'))).toEqual([]);
  });

  it('under forced colors, toggled controls take the system highlight and each status dot has its own shape', () => {
    const forced = block('media', '(forced-colors: active)');
    // The selected background vanished into the imposed palette; the system pair Highlight/HighlightText replaces it.
    expect(rule('.ib.on, .seg.on, .chip.on', forced).background).toBe('Highlight');
    // Only system colors in here: the --pr-* variables are the theme the system has just replaced.
    expect(allDeclarations(forced).filter((d) => d.value.includes('var(--pr-'))).toEqual([]);
    /** The declarations that apply to the legend dot of a status inside the block, in order. */
    const dot = (status: string): string =>
      (forced.nodes ?? [])
        .filter(isRule)
        .filter((r) => r.selectors.some((s) => s.trim() === `.leg i.status-${status}`))
        .flatMap((r) => (r.nodes ?? []).filter(isDeclaration).map((d) => `${d.prop}: ${d.value}`))
        .join('; ');
    const statuses = ['in-progress', 'owner', 'blocked', 'draft', 'available'];
    for (const s of statuses) expect(dot(s), s).not.toBe('');
    // Waiting and draft took the same gray: under forced colors they must not draw alike, nor like any other.
    expect(new Set(statuses.map(dot)).size).toBe(statuses.length);
  });

  it('the row: title on 1 line that shrinks, actions on the right and a subline below; the hover ones show on hover and on focus', () => {
    const line = rule('.ln');
    expect(line.display).toBe('grid');
    expect(line['grid-template-columns']).toBe('minmax(0, 1fr) auto');
    const body = rule('.ln-body');
    expect(body['grid-template-columns']).toBe('16px auto minmax(0, 1fr)');
    expect(body['min-width']).toBe('0');
    const title = rule('.ln .tt');
    expect(title['white-space']).toBe('nowrap');
    expect(title['text-overflow']).toBe('ellipsis');
    expect(rule('.ln .sub')['grid-column']).toBe('1 / -1');
    // The hover actions are hidden only at rest: the focus of any child of the row shows them too.
    expect(rule('.ln .hov').display).toBe('none');
    expect(rule('.ln:hover .hov, .ln:focus-within .hov').display).toBe('inline-flex');
  });

  it('in the homogeneous group the row has no icon column and the ID takes its place', () => {
    expect(rule('.ln.no-ic .ln-body')['grid-template-columns']).toBe('auto minmax(0, 1fr)');
    expect(rule('.ln.no-ic .sub')).toHaveProperty('padding-left');
  });

  it('tree alignment: the icon or ID of the item sits in the icon column of the section header', () => {
    // Header: 2px border + 16px arrow + 6px gap = 24px; the row: 22px of the list + 2px of the body.
    expect(rule('.sec-head').padding).toBe('3px 2px');
    expect(rule('.sec-head').gap).toBe('6px');
    expect(rule('.rows').padding).toBe('0 0 0 22px');
    expect(rule('.ln-body').padding).toBe('3px 2px');
  });

  it('the homogeneous group counter takes the status color on a background of it, with no fixed color', () => {
    const pc = rule('.sec-num.pc');
    expect(Object.values(pc).some((v) => v.includes('color-mix(in srgb, currentColor'))).toBe(true);
    expect(pc).toHaveProperty('border-radius');
  });

  it('Ideas uses the common row: without the loose list own rules, and the bulb in the status color', () => {
    expect(someSelector((s) => /\.ideias (li|ul|h3|\.titulo|\.badge)/.test(s))).toBe(false);
    expect(someSelector((s) => s.includes('.accoes-ideia'))).toBe(false);
    expect(someSelector((s) => s.includes('.badge-ideia-'))).toBe(false);
    expect(rule('.idea-color-refining').color).toBe('var(--pr-state-run)');
    expect(rule('.idea-color-ready').color).toBe('var(--pr-state-ok)');
    expect(rule('.idea-color-mapped').color).toBe('var(--pr-muted-fg)');
    expect(rule('.ln .acts .btn')['white-space']).toBe('nowrap');
    // The long slug does not hide the title: it gets at most half, with an ellipsis.
    expect(rule('.ln.idea .id')['max-width']).toBe('50%');
    expect(rule('.ln.idea .id')['text-overflow']).toBe('ellipsis');
  });

  it('the plan badge does not overlap the name: in the narrow panel it drops to the line below', () => {
    // Only the «⋯» menu floats; the card header never puts the badge over the name.
    // Plus the hidden label of the narrow tabs, the funnel dot and the live region, outside the card.
    expect(allDeclarations().filter((d) => d.prop === 'position' && d.value === 'absolute')).toHaveLength(4);
    expect(ruleListing('.live').position).toBe('absolute');
    expect(rule('.menu').position).toBe('absolute');
    expect(rule('.plan')['container-type']).toBe('inline-size');
    const narrow = block('container', '(max-width: 260px)');
    expect(rule('.header', narrow)['grid-template-areas']).toBe("'name' 'marks'");
    expect(rule('.marks', narrow)['justify-self']).toBe('start');
    expect(rule('.name')['overflow-wrap']).toBe('anywhere');
  });

  it('at 200px the phase title keeps width for the number: the counters disappear and the title shrinks', () => {
    const narrow = block('container', '(max-width: 260px)');
    expect(rule('.sec-summary .badges', narrow).display).toBe('none');
    expect(rule('.sec-title')['min-width']).toBe('0');
  });

  it('the environment footer: the missing in the error color, the note muted, and the ids wrap in the narrow panel', () => {
    expect(rule('.environment')['overflow-wrap']).toBe('anywhere');
    expect(rule('.environment-missing').color).toBe('var(--pr-error-fg)');
    expect(rule('.environment-note, .environment-hint').color).toBe('var(--pr-muted-fg)');
  });

  it('the «⋯» menu opens to the left and flips upward when there is no room below', () => {
    const menu = rule('.menu');
    expect(menu.right).toBe('0');
    expect(menu['max-width']).toMatch(/^calc\(100cqw - \d+px\)$/);
    expect(rule('.menu.above').bottom).toBe('100%');
    expect(rule('.menu-wrap').position).toBe('relative');
    expect(rule('.mi.danger').color).toBe('var(--pr-error-fg)');
  });

  it('the available segment in the stacked bar has no fill', () => {
    expect(rule('.seg-free').fill).toBe('transparent');
    expect(rule('.search-row').display).toBe('flex');
  });

  it('the sections that collapse left with the tabs', () => {
    expect(someSelector((s) => s.includes('.vsec'))).toBe(false);
  });

  it('the tab row pins to the top, opaque, above the filter bar and below the «⋯» menu', () => {
    const tabs = rule('.tabs');
    expect(tabs.position).toBe('sticky');
    expect(tabs.top).toBe('0');
    expect(tabs.display).toBe('flex');
    expect(tabs['background-color']).toBe('var(--pr-bg)');
    expect(tabs['border-bottom']).toBe('1px solid var(--pr-border)');
    expect(zIndex(tabs)).toBeGreaterThan(zIndex(rule('.filters')));
    expect(zIndex(tabs)).toBeLessThan(zIndex(rule('.menu')));
  });

  it('the tabs are a centered segmented control: three equal columns up to 420px, on a background of their own', () => {
    const list = rule('.tabs-list');
    expect(list.display).toBe('grid');
    expect(list['grid-template-columns']).toBe('repeat(3, minmax(0, 1fr))');
    expect(list['max-width']).toBe('420px');
    expect(list.margin).toBe('0 auto');
    expect(list['background-color']).toBe('var(--pr-segment-bg)');
    // The actions that a host without a title bar still draws stay on the right, without pushing the control.
    expect(list.flex).toBe('1');
  });

  it('the refresh icon spins during the read, and does not spin with reduced motion', () => {
    expect(block('keyframes', 'pr-spin')).toBeDefined();
    expect(rule('.ib[disabled] .ic-refresh').animation).toMatch(/^pr-spin /);
    const reduced = block('media', '(prefers-reduced-motion: reduce)');
    expect(allDeclarations(reduced).some((d) => d.prop === 'animation' && d.value === 'none')).toBe(true);
    expect(rule('.tabs-status').color).toBe('var(--pr-muted-fg)');
  });

  it('the segment: centered in the column, the active one with background and outline, no underline; visible focus', () => {
    const tab = rule('.tab');
    expect(tab['justify-content']).toBe('center');
    expect(tab.color).toBe('var(--pr-tab-inactive-fg)');
    expect(tab.border).toBe('1px solid transparent');
    expect(tab).not.toHaveProperty('border-bottom');
    const selected = rule(".tab[aria-selected='true']");
    expect(selected.color).toBe('var(--pr-tab-active-fg)');
    expect(selected['background-color']).toBe('var(--pr-bg)');
    expect(selected['border-color']).toBe('var(--pr-segment-active-border)');
    expect(allDeclarations().filter((d) => d.value.includes('--pr-tab-active-border'))).toEqual([]);
    expect(rule('.tab:focus-visible').outline).toBe('1px solid var(--pr-focus)');
  });

  it('the Now counter with an owner task takes the owner color', () => {
    const counter = rule('.tab .counter.owner');
    expect(counter['background-color']).toBe('var(--pr-state-owner)');
    // The number in the view background color: the --pr-badge-fg of Light Modern is dark and vanished on the dark purple.
    expect(counter.color).toBe('var(--pr-bg)');
  });

  it('below 300px the tabs keep icon and counter: the label leaves the view without display: none', () => {
    expect(rule('.tabs')['container-type']).toBe('inline-size');
    expect(() => block('container', '(max-width: 340px)')).toThrow();
    const narrow = block('container', '(max-width: 300px)');
    const label = rule('.tab-label', narrow);
    expect(label.position).toBe('absolute');
    expect(label).toHaveProperty('clip');
    expect(allDeclarations(narrow).filter((d) => d.prop === 'display' && d.value === 'none')).toEqual([]);
    // The counter keeps the number (it does not become a dot): it is what says what asks for you.
    expect(allDeclarations(narrow).filter((d) => d.prop === 'font-size' && d.value === '0')).toEqual([]);
  });

  it('the bar on 2 lines: the chips on a single row that scrolls, no scrollbar, fading when it overflows', () => {
    const chips = rule('.chips');
    expect(chips['flex-wrap']).toBe('nowrap');
    expect(chips['overflow-x']).toBe('auto');
    expect(chips['scrollbar-width']).toBe('none');
    expect(rule('.chips .chip').flex).toBe('none');
    expect(rule('.chips.overflows')).toHaveProperty('mask-image');
  });

  it('the funnel takes the active advanced dot in the corner, in the focus color', () => {
    expect(rule('.funnel').position).toBe('relative');
    const dot = rule('.funnel .dot');
    expect(dot.position).toBe('absolute');
    expect(Object.values(dot)).toContain('var(--pr-focus)');
  });

  it('the filter bar pins below the tab row', () => {
    expect(rule('.filters').top).toBe('var(--pr-tabs-height, 0px)');
  });

  it('the section is a full-width button that rotates the arrow when collapsed, and the done one is dimmed', () => {
    expect(rule('.sec-head').width).toBe('100%');
    expect(rule(".sec-head[aria-expanded='false'] > .ic")).toHaveProperty('transform');
    // The abandoned phase too: it left the plan, like the done one.
    expect(rule('.sec.done .sec-head, .sec.abandoned .sec-head')).toHaveProperty('opacity');
    expect(rule('.sec-num')['font-variant-numeric']).toBe('tabular-nums');
  });

  it('the subtask is indented by depth', () => {
    expect(rule('.ln.child.depth-1 .ln-body')).toHaveProperty('padding-left');
    expect(rule('.ln.child.depth-2 .ln-body')).toHaveProperty('padding-left');
  });

  it('the next step breaks a long path without spaces instead of overflowing the card', () => {
    // At 200px, a next_step with a path without spaces widened the card: `anywhere` also reduces the minimum width.
    expect(rule('.dlg .box')['overflow-wrap']).toBe('anywhere');
  });

  it('the visual base: buttons, chips, pills, counters, stacked bar and ring', () => {
    expect(Object.values(rule('.btn'))).toContain('var(--pr-button-secondary-bg)');
    expect(rule('.btn.pri').background).toBe('var(--pr-button-bg)');
    expect(rule('.btn.pri').color).toBe('var(--pr-button-fg)');
    expect(rule('.ib').display).toBe('inline-grid');
    expect(rule('.chip')).toHaveProperty('border-radius');
    expect(rule('.chip.on').background).toBe('var(--pr-selected-bg)');
    expect(rule('.pill')).toHaveProperty('border-radius');
    expect(Object.values(rule('.counter'))).toContain('var(--pr-badge-bg)');
    expect(Object.values(rule('.stacked-bar'))).toContain('var(--pr-track-bg)');
    expect(rule('.ring')).toHaveProperty('width');
    expect(rule('.ring-arc').stroke).toBe('var(--pr-progress-bg)');
  });

  it('each status has the color of its --pr-state-*, and the icon gets it through currentColor', () => {
    expect(rule('.status-done, .status-available').color).toBe('var(--pr-state-ok)');
    expect(rule('.status-in-progress').color).toBe('var(--pr-state-run)');
    expect(rule('.status-blocked').color).toBe('var(--pr-state-wait)');
    expect(rule('.status-owner').color).toBe('var(--pr-state-owner)');
    // Cancelled and abandoned left the plan: dimmed like the draft; the icon (/ and ×) says which of the two.
    expect(rule('.status-draft, .status-cancelled, .status-abandoned').color).toBe('var(--pr-muted-fg)');
    expect(rule('.ln.group-done .tt, .ln.group-cancelled .tt, .ln.group-abandoned .tt').color).toBe('var(--pr-muted-fg)');
    expect(rule('.status-invalid').color).toBe('var(--pr-error-fg)');
    expect(rule('.seg-ok').fill).toBe('var(--pr-state-ok)');
    expect(rule('.seg-draft').fill).toBe('var(--pr-muted-fg)');
    expect(rule('.ic').stroke).toBe('currentColor');
  });

  it('every clickable element of the base has visible focus in --pr-focus', () => {
    const focus = rule('.btn:focus-visible, .ib:focus-visible, .chip:focus-visible');
    expect(focus.outline).toContain('var(--pr-focus)');
  });

  it('the phase title keeps cutting with an ellipsis when the panel narrows', () => {
    const title = rule('.sec-title');
    expect(title['text-overflow']).toBe('ellipsis');
    expect(title['white-space']).toBe('nowrap');
    expect(title.overflow).toBe('hidden');
  });

  it('the card header pins right below the filter bar, opaque and beneath it and the «⋯» menu', () => {
    const header = rule('.plan > .header');
    expect(header.position).toBe('sticky');
    // Below the tab row and the filter bar.
    expect(header.top).toBe('calc(var(--pr-tabs-height, 0px) + var(--pr-filters-height, 0px))');
    expect(header['background-color']).toBe('var(--pr-bg)');
    expect(zIndex(header)).toBeGreaterThan(0);
    expect(zIndex(header)).toBeLessThan(zIndex(rule('.filters')));
    expect(zIndex(header)).toBeLessThan(zIndex(rule('.menu')));
    // The hover cannot leave the background transparent: the tasks would show through behind it.
    const hover = rule('.header:hover');
    expect([hover.background, hover['background-color']]).not.toContain('transparent');
  });

  it('the card top fits in the card also when it is a <div> (Now and Ideas), not only <button>', () => {
    // width: 100% + padding on a content-box <div> overflowed the card by 16 px and gave the panel horizontal scroll.
    const header = rule('.header');
    expect(header.width).toBe('100%');
    expect(header['box-sizing']).toBe('border-box');
  });

  it('in the narrow card the plan buttons tighten so the «⋯» does not fall alone on a line', () => {
    const narrow = block('container', '(max-width: 280px)');
    expect(() => rule('.pact', narrow)).not.toThrow();
    expect(rule('.pact .btn', narrow).padding).toMatch(/^0 6px\b/);
  });

  it('the scrollbar does not narrow the card only when it appears: the gutter stays reserved', () => {
    // Without that, opening a phase at ~295 px made the page scroll, the card lost 10 px and fell into the 260 px query.
    expect(rule('html')['scrollbar-gutter']).toBe('stable');
  });

  it('the last button and the «⋯» wrap together and the «⋯» stays on the right', () => {
    const end = rule('.pact-end');
    expect(end.display).toBe('flex');
    expect(end.flex).toBe('1 0 auto');
    expect(end['flex-wrap']).not.toBe('wrap');
    expect(end.gap).toBe('inherit');
  });

  it('the ring track is the dimmed arc, as in the prototype, and does not vanish in the dark theme', () => {
    // --pr-track-bg (editorWidget-background) is almost the color of the side bar in Dark Modern: the phase at 0% vanished.
    const background = rule('.ring-background');
    expect(background.stroke).toBe('var(--pr-progress-bg)');
    expect(background['stroke-opacity']).toBe('0.25');
  });
});

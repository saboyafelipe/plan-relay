// @vitest-environment happy-dom
// The panel «Ideias» section: the view, the HTML, the messages and the clicks.
import type { IdeaInput } from './input';
import { isWebviewMessage, isHostMessage } from './messages';
import { ideasView, type IdeasView } from './view';
import { clickOf } from './page';
import { ideaPlan, render as renderIn } from './render';
import { stringsFor } from '@plan-relay/i18n';
import { attributeOf, elementOf, hasElement, mountPanel, parseHtml, textOf } from './testing/panel-dom';

// The expectations are in pt-BR; the code falls back to English.
const render = (input: Parameters<typeof renderIn>[0]): string => renderIn({ ...input, strings: input.strings ?? stringsFor('pt-BR') });

function idea(slug: string, status: IdeaInput['status'], over: Partial<IdeaInput> = {}): IdeaInput {
  return { file: `/ws/agent_plans/_ideas/${slug}.md`, slug, title: `Titulo ${slug}`, status, openQuestions: 0, plan: null, ...over };
}

const ALL = ['refine', 'map', 'open', 'new', 'folder'] as const;

function html(ideas: IdeasView | undefined): string {
  return render({ plans: [], updated: '10:42', ideas, tab: 'ideas' });
}

describe('ideasView', () => {
  it('one view per idea, with the file as id, the state and the questions read', () => {
    const v = ideasView(
      [idea('a', 'refining', { openQuestions: 2 }), idea('b', 'mapped', { plan: 'agent_plans/p/', openQuestions: 0 })],
      [...ALL],
    );
    expect(v.actions).toEqual(['refine', 'map', 'open', 'new', 'folder']);
    expect(v.items[0]).toEqual({ id: '/ws/agent_plans/_ideas/a.md', title: 'Titulo a', status: 'refining', questions: 2 });
    expect(v.items[1]).toEqual({
      id: '/ws/agent_plans/_ideas/b.md',
      title: 'Titulo b',
      status: 'mapped',
      questions: 0,
      plan: 'agent_plans/p/',
    });
  });

  it('an invalid idea has no known questions', () => {
    expect(ideasView([idea('x', 'invalid', { openQuestions: null })], ['open']).items[0]).toMatchObject({
      status: 'invalid',
      questions: null,
    });
  });
});

/** The `<li>` of the row of the idea `slug` in the HTML. */
function rowOf(output: string, slug: string): string {
  const started = output.indexOf(`data-idea="/ws/agent_plans/_ideas/${slug}.md"`);
  const li = output.lastIndexOf('<li', started);
  return output.slice(li, output.indexOf('</li>', started) + 5);
}

describe('render: «Ideias» tab as a card', () => {
  it('without ideas, the card appears with «Nova ideia», «Abrir pasta» and the line saying where they are', () => {
    const output = html({ items: [], actions: [...ALL] });
    expect(output).toContain('<article class="plan expanded ideas-card">');
    expect(output).toMatch(/data-action="idea-new"[^>]*>.*?Nova ideia<\/button>/s);
    expect(output).toMatch(/data-action="ideas-folder"[^>]*>.*?Abrir pasta<\/button>/s);
    expect(output).toContain('Nenhuma ideia em <code>agent_plans/_ideas/</code> nesta pasta.');
    expect(output).not.toContain('class="filters"');
  });

  it('without the ideas view (a host that does not read them), the card only says where they are, with no buttons', () => {
    const output = html(undefined);
    expect(output).toContain('Nenhuma ideia em');
    expect(output).not.toContain('data-action="idea-new"');
  });

  it('«Nova ideia» and «Abrir pasta» only with the action the host handles', () => {
    const output = html({ items: [], actions: ['refine', 'map', 'open'] });
    expect(output).not.toContain('data-action="idea-new"');
    expect(output).not.toContain('data-action="ideas-folder"');
  });

  it('the tab is the last in the row and the card comes after the row', () => {
    const v = ideasView([idea('a', 'open')], [...ALL]);
    const plan = { id: '/ws/agent_plans/p', name: 'p', pct: 0, done: 0, total: 0, phases: [], tasks: [], parallel: [] };
    const output = render({ plans: [plan], updated: '10:42', ideas: v, tab: 'ideas' });
    expect(output.indexOf('data-tab="ideas"')).toBeGreaterThan(output.indexOf('data-tab="plans"'));
    expect(output.indexOf('ideas-card')).toBeGreaterThan(output.indexOf('role="tabpanel"'));
    expect(output).not.toContain('data-action="toggle"');
  });

  it('the sections follow the state order, with the bulb in the state color, and Mapped comes closed', () => {
    const v = ideasView(
      [idea('m', 'mapped', { plan: 'agent_plans/p' }), idea('r', 'ready'), idea('o', 'open'), idea('f', 'refining'), idea('x', 'invalid')],
      [...ALL],
    );
    const output = html(v);
    const heads = parseHtml(output).querySelectorAll<HTMLElement>('[data-action="ideas-section"]');
    expect([...heads].map((h) => h.dataset.status)).toEqual(['open', 'refining', 'ready', 'mapped', 'invalid']);
    const refining = elementOf(output, '[data-action="ideas-section"][data-status="refining"]');
    expect(refining.getAttribute('aria-expanded')).toBe('true');
    const bulb = refining.querySelector('span.sec-ic.idea-color-refining');
    expect(bulb?.firstElementChild?.getAttribute('class')).toBe('ic ic-ideas');
    expect(output).toContain('>Abertas<');
    expect(output).toContain('>Mapeadas<');
    expect(attributeOf(output, '[data-status="mapped"][aria-expanded]', 'aria-expanded')).toBe('false');
    expect(output).not.toContain('data-idea="/ws/agent_plans/_ideas/m.md"');
  });

  it('the rows have no state icon or badge: the slug in place of the ID, the title and the questions in the subline', () => {
    const output = html(ideasView([idea('a', 'refining', { openQuestions: 3 })], [...ALL]));
    const li = rowOf(output, 'a');
    expect(li).toMatch(/^<li class="ln [^"]*no-ic"/);
    expect(li).not.toContain('ic-ideas');
    expect(li).not.toContain('badge');
    expect(li).toContain('<span class="id">a</span><span class="tt">Titulo a</span>');
    expect(li).toMatch(/<div class="sub"[^>]*>3 perguntas em aberto<\/div>/);
    expect(output).toContain('<span class="tab-label">Ideias</span><span class="counter">1</span>');
  });

  it('on an open idea, «Afinar» is the main action, always visible, after the hover buttons', () => {
    const li = rowOf(html(ideasView([idea('a', 'open', { openQuestions: 2 })], [...ALL])), 'a');
    const hov = li.slice(li.indexOf('<span class="hov">'), li.indexOf('data-action="idea-refine"'));
    expect(hov).toContain('data-action="idea-map"');
    expect(hov).toContain('data-action="idea-open"');
    // The main action stays out of the hover (the </span> closes the hover before it) and last among the actions.
    const refineButton = elementOf(li, 'button.btn.sm.pri[data-action="idea-refine"]');
    expect(refineButton.closest('.hov')).toBeNull();
    expect(refineButton.previousElementSibling?.classList.contains('hov')).toBe(true);
    expect(refineButton.nextElementSibling).toBeNull();
    expect(refineButton.textContent).toContain('Afinar');
  });

  it('on a ready idea, «Criar tasks» is the main action and «Afinar» goes to the hover', () => {
    const li = rowOf(html(ideasView([idea('r', 'ready')], [...ALL])), 'r');
    const mapButton = elementOf(li, 'button.btn.sm.pri[data-action="idea-map"]');
    expect(mapButton.closest('.hov')).toBeNull();
    expect(mapButton.nextElementSibling).toBeNull();
    expect(mapButton.textContent).toContain('Criar tasks');
    expect(li.indexOf('data-action="idea-refine"')).toBeLessThan(li.indexOf('data-action="idea-map"'));
  });

  it('the mapped idea brings the plan link in the subline, with no Afinar or Criar tasks', () => {
    const v = ideasView([idea('m', 'mapped', { plan: 'agent_plans/p/' })], [...ALL]);
    const output = render({
      plans: [],
      updated: '10:42',
      ideas: v,
      tab: 'ideas',
      openPhases: {
        '\u0000ideas': ['mapped'],
      },
    });
    const li = rowOf(output, 'm');
    expect(textOf(li, 'div.sub > button.link[data-action="idea-plan"][data-plan="agent_plans/p/"]')).toBe('→ p');
    expect(li).not.toContain('data-action="idea-refine"');
    expect(li).not.toContain('data-action="idea-map"');
    expect(li).toContain('data-action="idea-open"');
  });

  it('one question, none and unknown count', () => {
    expect(html(ideasView([idea('a', 'open', { openQuestions: 1 })], [...ALL]))).toContain('1 pergunta em aberto');
    expect(html(ideasView([idea('a', 'ready', { openQuestions: 0 })], [...ALL]))).toContain('0 perguntas em aberto');
    expect(html(ideasView([idea('a', 'open', { openQuestions: null })], [...ALL]))).toContain('perguntas em aberto: não se sabe');
  });

  it('with a filter in effect, the sections with a result all open (Mapped too) and the empty ones disappear', () => {
    const v = ideasView([idea('m', 'mapped', { plan: 'agent_plans/p' }), idea('o', 'open')], [...ALL]);
    const output = render({
      plans: [],
      updated: '10:42',
      ideas: v,
      tab: 'ideas',
      tabBar: {
        ideas: { q: '', states: ['mapped'] },
      },
    });
    expect(attributeOf(output, '[data-status="mapped"][aria-expanded]', 'aria-expanded')).toBe('true');
    expect(hasElement(output, '[data-action="ideas-section"][data-status="open"]')).toBe(false);
  });

  it('an invalid idea can only be opened', () => {
    const output = html(ideasView([idea('x', 'invalid', { openQuestions: null })], [...ALL]));
    expect(output).toContain('>Inválidas<');
    expect(output).not.toContain('data-action="idea-refine"');
    expect(output).not.toContain('data-action="idea-map"');
    expect(output).toContain('data-action="idea-open"');
  });

  it('only the actions the host handles are shown: without open, no Abrir', () => {
    const output = html(ideasView([idea('a', 'open')], ['refine', 'map']));
    expect(output).toContain('data-action="idea-refine"');
    expect(output).not.toContain('data-action="idea-open"');
  });

  it('escapes title and plan, which come from the file', () => {
    const v = ideasView([idea('a', 'mapped', { title: '<b>x</b>', plan: '"><i>' })], [...ALL]);
    const output = render({
      plans: [],
      updated: '10:42',
      ideas: v,
      tab: 'ideas',
      openPhases: {
        '\u0000ideas': ['mapped'],
      },
    });
    expect(output).not.toContain('<b>x</b>');
    expect(output).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(output).not.toContain('"><i>');
  });

  it('the search looks in the file name and the title, not in the folder; the term is highlighted in the title', () => {
    const v = ideasView([idea('painel-novo', 'open', { title: 'Algo novo' }), idea('outra', 'ready')], [...ALL]);
    const search = (q: string): string =>
      render({
        plans: [],
        updated: '10:42',
        ideas: v,
        tab: 'ideas',
        tabBar: {
          ideas: { q, states: [] },
        },
      });
    expect(search('painel-novo')).toContain('Algo novo');
    expect(search('painel-novo')).not.toContain('Titulo outra');
    expect(search('agent_plans')).toContain('Nenhuma ideia com esses filtros.');
    expect(search('novo')).toContain('Algo <mark>novo</mark>');
  });

  it('the Ideas bar has chips for the present states, without a funnel', () => {
    const output = html(ideasView([idea('a', 'open'), idea('b', 'ready'), idea('c', 'ready')], [...ALL]));
    expect(output).toMatch(/data-status="open"[^>]*>aberta<span class="n">1<\/span>/);
    expect(output).toMatch(/data-status="ready"[^>]*>pronta<span class="n">2<\/span>/);
    expect(output).not.toContain('data-status="mapped"');
    expect(output).not.toContain('data-action="advanced"');
  });
});

describe('idea messages', () => {
  it('the webview sends ideaRefine, ideaMap and ideaOpen with the idea', () => {
    for (const type of ['ideaRefine', 'ideaMap', 'ideaOpen']) {
      expect(isWebviewMessage({ type, idea: '/ws/agent_plans/_ideas/a.md' })).toBe(true);
      expect(isWebviewMessage({ type })).toBe(false);
      expect(isWebviewMessage({ type, idea: '' })).toBe(false);
      expect(isWebviewMessage({ type, idea: 1 })).toBe(false);
    }
  });

  it('the status accepts the ideas with the host actions, and refuses the wrong shape', () => {
    const base = { type: 'status', plans: [], updated: '10:42' };
    expect(isHostMessage({ ...base, ideas: { items: [], actions: ['open'] } })).toBe(true);
    expect(isHostMessage({ ...base, ideas: { items: [], actions: ['outra'] } })).toBe(false);
    expect(isHostMessage({ ...base, ideas: { items: {}, actions: [] } })).toBe(false);
    expect(isHostMessage({ ...base, ideas: 1 })).toBe(false);
  });

  it('clickOf translates the three buttons and refuses the incomplete', () => {
    expect(clickOf({ action: 'idea-refine', idea: 'i' })).toEqual({ type: 'ideaRefine', idea: 'i' });
    expect(clickOf({ action: 'idea-map', idea: 'i' })).toEqual({ type: 'ideaMap', idea: 'i' });
    expect(clickOf({ action: 'idea-open', idea: 'i' })).toEqual({ type: 'ideaOpen', idea: 'i' });
    expect(clickOf({ action: 'idea-open' })).toBeUndefined();
  });

  it('«Nova ideia» sends ideaNew and «Abrir pasta» sends ideaFolder, with no argument', () => {
    expect(clickOf({ action: 'idea-new' })).toEqual({ type: 'ideaNew' });
    expect(clickOf({ action: 'ideas-folder' })).toEqual({ type: 'ideaFolder' });
    expect(isWebviewMessage({ type: 'ideaNew' })).toBe(true);
    expect(isWebviewMessage({ type: 'ideaFolder' })).toBe(true);
    expect(isHostMessage({ type: 'status', plans: [], updated: '10:42', ideas: { items: [], actions: ['new', 'folder'] } })).toBe(true);
  });

  it('clickOf translates the section and the plan link, and refuses the incomplete', () => {
    expect(clickOf({ action: 'ideas-section', status: 'mapped' })).toEqual({ type: 'ideasSection', status: 'mapped' });
    expect(clickOf({ action: 'ideas-section', status: 'outro' })).toBeUndefined();
    expect(clickOf({ action: 'idea-plan', plan: 'agent_plans/p' })).toEqual({ type: 'ideaPlan', plan: 'agent_plans/p' });
    expect(clickOf({ action: 'idea-plan' })).toBeUndefined();
  });
});

describe('ideaPlan', () => {
  const plans = [{ id: '/ws/agent_plans/outro-p' }, { id: '/ws/agent_plans/p' }];
  it('finds the plan by the path in the Plan: header, with or without a trailing slash', () => {
    expect(ideaPlan(plans, 'agent_plans/p')).toBe('/ws/agent_plans/p');
    expect(ideaPlan(plans, 'agent_plans/p/')).toBe('/ws/agent_plans/p');
    expect(ideaPlan([{ id: 'C:\\ws\\agent_plans\\p' }], 'agent_plans/p')).toBe('C:\\ws\\agent_plans\\p');
  });
  it('without a plan with that path, nothing', () => {
    expect(ideaPlan(plans, 'agent_plans/q')).toBeUndefined();
    expect(ideaPlan(plans, '')).toBeUndefined();
  });
});

describe('bindPanel with ideas', () => {
  it('draws the ideas of the status and sends the click to the host', () => {
    const p = mountPanel({ tab: 'ideas' });
    p.receive({ type: 'status', plans: [], updated: '10:42', ideas: ideasView([idea('a', 'open')], [...ALL]) });
    expect(p.root.textContent).toContain('Titulo a');
    // The click lands on the icon inside the button, as the pointer does.
    p.control({ action: 'idea-refine', idea: '/ws/agent_plans/_ideas/a.md' })
      .querySelector('svg')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(p.sent.at(-1)).toEqual({ type: 'ideaRefine', idea: '/ws/agent_plans/_ideas/a.md' });
  });
});

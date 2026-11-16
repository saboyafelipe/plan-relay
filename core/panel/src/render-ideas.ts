// The Ideas tab: the agent_plans/_ideas/ card, one section per idea status and the idea rows.
import type { Key, Strings } from '@plan-relay/i18n';
import { countIdeasByState, highlight, filterIdeas, activeIdeasFilters, termsOf, type IdeaState, type IdeasFilters } from './filter';
import { icon, type IconName } from './icons';
import type { IdeaView, IdeasView, PlanView } from './view';
import { row, chip, detailDialog, filterBar, type Section, sections } from './render-shared';
import { button, escapeHtml } from './util';

/** The idea file name without the folders and without `.md`: the slug, which takes the place of the ID on the row. */
function ideaSlug(id: string): string {
  const file = id.split(/[\\/]/).pop() ?? id;
  return file.replace(/\.md$/i, '');
}

/** The path without trailing slashes and with `/`: the idea `Plan:` and the plan `id` are compared this way. */
function normalPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * The `id` of the plan an idea produced when mapped: its `Plan:` is relative to the workspace folder
 * (`agent_plans/<plan>`), and the plan `id` is the whole folder; the plan whose path ends with the idea's wins.
 */
export function ideaPlan(plans: readonly Pick<PlanView, 'id'>[], plan: string): string | undefined {
  const target = normalPath(plan);
  if (target === '') return undefined;
  return plans.find((p) => {
    const id = normalPath(p.id);
    return id === target || id.endsWith(`/${target}`);
  })?.id;
}

/** The text of the open questions of an idea (the subline of those that have not become a plan yet). */
function questionsText(n: number | null, x: Strings): string {
  if (n === null) return x.t('ideas.questionsUnknown');
  return n === 1 ? x.t('ideas.oneQuestion') : x.t('ideas.questions', n);
}

/** What can be done with an idea: refine and map only while it is open (mapped and invalid ones only open), and only what the host handles. */
function ideaCan(i: IdeaView, actions: IdeasView['actions']): { opened: boolean; refine: boolean; map: boolean; open: boolean } {
  const opened = i.status === 'open' || i.status === 'refining' || i.status === 'ready';
  return { opened, refine: opened && actions.includes('refine'), map: opened && actions.includes('map'), open: actions.includes('open') };
}

/** The «→ plan» link of a mapped idea; `tabindex` -1 on the row, where the tree is a single Tab stop. */
function ideaPlanLink(i: IdeaView, x: Strings, inTree: boolean): string {
  if (i.status !== 'mapped' || i.plan === undefined) return '';
  const name = normalPath(i.plan).split('/').pop() ?? i.plan;
  const tooltip = escapeHtml(x.t('ideas.viewPlan', name));
  const attributes = `class="link" data-action="idea-plan" data-plan="${escapeHtml(i.plan)}" title="${tooltip}"${inTree ? ' tabindex="-1"' : ''}`;
  return button(attributes, escapeHtml(x.t('ideas.plan', name)));
}

/**
 * The row of an idea over the common row: no icon (the colored bulb is in the section header), the slug in
 * place of the ID, the title and the subline with the open questions or, if mapped, the plan link. The main action stays on the
 * right and always visible — «Refine», or «Create tasks» on a ready idea, which has nothing left to ask —, and the others
 * show on hover, to its left. Mapped and invalid ones are neither refined nor mapped: they only open. The body opens the
 * detail, which carries the same actions for the keyboard.
 */
function ideaRow(i: IdeaView, actions: IdeasView['actions'], x: Strings, terms: readonly string[]): string {
  const id = escapeHtml(i.id);
  const icn = (action: string, label: Key, ic: IconName): string => {
    const r = escapeHtml(x.t(label));
    return `<button type="button" class="ib" data-action="${action}" data-idea="${id}" aria-label="${r}" title="${r}" tabindex="-1">${icon(ic)}</button>`;
  };
  const pri = (action: string, label: Key, ic: IconName): string =>
    `<button type="button" class="btn sm pri" data-action="${action}" data-idea="${id}" tabindex="-1">${icon(ic)}${escapeHtml(x.t(label))}</button>`;
  const can = ideaCan(i, actions);
  const ready = i.status === 'ready';
  const hover: string[] = [];
  let main = '';
  if (can.refine) {
    if (ready) hover.push(icn('idea-refine', 'ideas.refine', 'refine'));
    else main = pri('idea-refine', 'ideas.refine', 'refine');
  }
  if (can.map) {
    if (ready) main = pri('idea-map', 'ideas.createTasks', 'mapAction');
    else hover.push(icn('idea-map', 'ideas.createTasks', 'mapAction'));
  }
  if (can.open) hover.push(icn('idea-open', 'ideas.open', 'file'));
  const sub: string[] = [];
  if (can.opened) sub.push(escapeHtml(questionsText(i.questions, x)));
  else {
    const link = ideaPlanLink(i, x, true);
    if (link) sub.push(link);
  }
  const title = escapeHtml(i.title);
  const label = escapeHtml(`${i.title}, ${x.t(`ideas.state-${i.status}`)}`);
  return row({
    key: i.id,
    classes: ['idea', `idea-${i.status}`],
    icon: null,
    id: highlight(ideaSlug(i.id), terms),
    title: highlight(i.title, terms),
    attributes: `role="treeitem" tabindex="-1" aria-level="2" aria-label="${label}" title="${title}" data-action="idea-detail" data-idea="${id}"`,
    hover,
    main,
    sub,
  });
}

/**
 * The popup of an idea, the same `<dialog>` as the task one: slug, state and title; the open questions or the plan it became;
 * the file; and the actions of the row in the footer, the main one first. An idea that is not in the read gives nothing.
 */
export function ideaDetail(ideas: IdeasView | undefined, file: string, x: Strings): string {
  const i = ideas?.items.find((k) => k.id === file);
  if (!ideas || !i) return '';
  const id = escapeHtml(i.id);
  const can = ideaCan(i, ideas.actions);
  const footerButton = (action: string, label: Key, ic: IconName, main: boolean): string =>
    `<button type="button" class="btn${main ? ' pri' : ''}" data-action="${action}" data-idea="${id}">${icon(ic)}${escapeHtml(x.t(label))}</button>`;
  const ready = i.status === 'ready';
  const refine = can.refine ? footerButton('idea-refine', 'ideas.refine', 'refine', !ready) : '';
  const map = can.map ? footerButton('idea-map', 'ideas.createTasks', 'mapAction', ready) : '';
  const buttons = [...(ready ? [map, refine] : [refine, map]), can.open ? footerButton('idea-open', 'ideas.open', 'file', false) : ''];
  const link = ideaPlanLink(i, x, false);
  const said = can.opened
    ? `<div class="box">${escapeHtml(questionsText(i.questions, x))}</div>`
    : link && `<div class="deps">${link}</div>`;
  const head = {
    icon: icon('ideas'),
    id: ideaSlug(i.id),
    color: `idea-color-${i.status}` as const,
    status: x.t(`ideas.state-${i.status}`),
    title: i.title,
  };
  const body = `<div class="db">${said}<dl class="grid"><dt>${escapeHtml(x.t('detail.file'))}</dt><dd class="file">${id}</dd></dl></div>`;
  return detailDialog(head, body, buttons, x);
}

/** The idea states in the order of the chips and sections: from what asks for work to what already became a plan. */
const IDEA_STATES: readonly IdeaState[] = ['open', 'refining', 'ready', 'mapped', 'invalid'];

/** The `Saved.openPhases` key of the open Ideas sections; it cites no plan. */
export const IDEAS_KEY = '\u0000ideas';

/** The Ideas sections that open by themselves: all but mapped, which already became a plan. */
export function ideasSectionsByDefault(): IdeaState[] {
  return IDEA_STATES.filter((e) => e !== 'mapped');
}

/**
 * The body of the «Ideas» tab: with ideas, the bar (search and status chips) and the `agent_plans/_ideas/` folder card,
 * with «New idea» and «Open folder» (if the host handles them) and one section per status with an idea; without ideas, the card with the line
 * saying where they are. With a filter in effect, the sections with a result all open and the others disappear.
 */
export function ideasBody(ideas: IdeasView | undefined, f: IdeasFilters, opened: readonly string[] | undefined, x: Strings): string {
  const actions: string[] = [];
  if (ideas?.actions.includes('new'))
    actions.push(`<button type="button" class="btn pri" data-action="idea-new">${icon('new')}${escapeHtml(x.t('ideas.new'))}</button>`);
  if (ideas?.actions.includes('folder'))
    actions.push(
      `<button type="button" class="btn" data-action="ideas-folder">${icon('folder')}${escapeHtml(x.t('ideas.openFolder'))}</button>`,
    );
  const head = `<div class="header"><span class="name">agent_plans/_ideas/</span></div>${actions.length ? `<div class="pact">${actions.join('')}</div>` : ''}`;
  const cardWith = (body: string): string => `<article class="plan expanded ideas-card">${head}${body}</article>`;
  if (!ideas || ideas.items.length === 0) {
    // The argument is HTML (the path in <code>): it goes in after escapeHtml on the text.
    const empty = escapeHtml(x.t('ideas.empty', '\u0000')).replace('\u0000', '<code>agent_plans/_ideas/</code>');
    return cardWith(`<div class="body"><p class="empty">${empty}</p></div>`);
  }
  const active = activeIdeasFilters(f);
  const terms = termsOf(f.q);
  const items = active ? filterIdeas(ideas.items, f) : ideas.items;
  const counts = countIdeasByState(ideas.items, f);
  const chips = IDEA_STATES.filter((e) => (counts[e] ?? 0) > 0 || f.states.includes(e))
    .map((e) => chip(`idea-color-${e}`, `data-status="${e}"`, f.states.includes(e), x.t(`ideas.state-${e}`), counts[e] ?? 0))
    .join('');
  const bar = filterBar(
    { q: f.q, placeholder: 'filter.searchIdeas', chips, isOpen: false, active, match: items.length, total: ideas.items.length },
    x,
  );
  if (items.length === 0)
    return `${bar}${cardWith(`<div class="body"><p class="empty no-result">${escapeHtml(x.t('filter.noResultIdeas'))}</p></div>`)}`;
  const openNow = new Set<string>(opened ?? ideasSectionsByDefault());
  const bySection = IDEA_STATES.map((e): Section | undefined => {
    const ofStatus = items.filter((i) => i.status === e);
    if (ofStatus.length === 0) return undefined;
    const label = x.t(`ideas.section-${e}`);
    return {
      classes: [`ideas-${e}`, ...(e === 'mapped' ? ['done'] : [])],
      opened: active || openNow.has(e),
      attributes: `data-action="ideas-section" data-status="${e}" aria-label="${escapeHtml(x.t('ideas.group', label, ofStatus.length))}"`,
      icon: icon('ideas'),
      iconColor: `idea-color-${e}`,
      title: escapeHtml(label),
      num: String(ofStatus.length),
      color: `idea-color-${e}`,
      body: () => `<ul class="rows" role="group">${ofStatus.map((i) => ideaRow(i, ideas.actions, x, terms)).join('')}</ul>`,
    };
  });
  const tree = sections(bySection, true);
  return `${bar}${cardWith(`<div class="body" role="tree" aria-label="${escapeHtml(x.t('ideas.tree'))}">${tree}</div>`)}`;
}

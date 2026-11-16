// Search and filters of the task list (panel v2) and of the Now and Ideas tabs. Pure: it touches neither the DOM nor state.
import type { TaskGroup } from './input';
import type { CountByGroup, TaskView, IdeaView } from './view';
import { escapeHtml } from './util';

/** The task list filters. Empty means «without that filter». */
export interface Filters {
  /** The search text: words separated by spaces, all of them must appear. */
  q: string;
  groups: TaskGroup[];
  track: string;
  tier: string;
}

export const EMPTY_FILTERS: Readonly<Filters> = { q: '', groups: [], track: '', tier: '' };

/** The search words, lowercase and without repeats. */
export function termsOf(q: string): string[] {
  return [...new Set(q.toLowerCase().split(/\s+/).filter(Boolean))];
}

/** Some filter is in effect (a search of only spaces does not count). */
export function activeFilters(f: Filters): boolean {
  return termsOf(f.q).length > 0 || f.groups.length > 0 || f.track !== '' || f.tier !== '';
}

/** The text the search looks in: ID, title, track, type and repos (the task body and the next step are left out). */
function haystack(t: TaskView): string {
  return [t.id, t.title, t.track, t.type, ...t.repos].join('\n').toLowerCase();
}

function passesWithoutState(t: TaskView, f: Filters): boolean {
  if (f.track !== '' && t.track !== f.track) return false;
  if (f.tier !== '' && t.tier !== f.tier) return false;
  const terms = termsOf(f.q);
  if (terms.length === 0) return true;
  const text = haystack(t);
  return terms.every((p) => text.includes(p));
}

/** The task passes the search and the status, track and tier filters. */
export function passes(t: TaskView, f: Filters): boolean {
  return (f.groups.length === 0 || f.groups.includes(t.group)) && passesWithoutState(t, f);
}

/** The tasks that pass, in the same order. */
export function filter(tasks: readonly TaskView[], f: Filters): TaskView[] {
  return tasks.filter((t) => passes(t, f));
}

/** How many tasks there are per status among those that pass the search, the track and the tier (the status chip shows what would come from selecting it). */
export function countByState(tasks: readonly TaskView[], f: Filters): CountByGroup {
  const c: CountByGroup = {};
  for (const t of tasks) if (passesWithoutState(t, f)) c[t.group] = (c[t.group] ?? 0) + 1;
  return c;
}

/** The filters of the «Now» tab: the search, the groups (chips) and, in advanced, the plan (`PlanView.id`). */
export interface NowFilters {
  q: string;
  groups: TaskGroup[];
  plan: string;
}

export const EMPTY_NOW_FILTERS: Readonly<NowFilters> = { q: '', groups: [], plan: '' };

export function activeNowFilters(f: NowFilters): boolean {
  return termsOf(f.q).length > 0 || f.groups.length > 0 || f.plan !== '';
}

/** The status of an idea, as the view brings it. */
export type IdeaState = IdeaView['status'];

/** The filters of the «Ideas» tab: the search and the states (chips). */
export interface IdeasFilters {
  q: string;
  states: IdeaState[];
}

export const EMPTY_IDEAS_FILTERS: Readonly<IdeasFilters> = { q: '', states: [] };

export function activeIdeasFilters(f: IdeasFilters): boolean {
  return termsOf(f.q).length > 0 || f.states.length > 0;
}

type FilterableIdea = Pick<IdeaView, 'id' | 'title' | 'status'>;

/** Where the search looks in an idea: the file name (the slug, without the folders of the path) and the title. */
function ideaHaystack(i: FilterableIdea): string {
  const file = i.id.split(/[\\/]/).pop() ?? i.id;
  return `${file}\n${i.title}`.toLowerCase();
}

function ideaMatchesSearch(i: FilterableIdea, terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const text = ideaHaystack(i);
  return terms.every((p) => text.includes(p));
}

/** The idea passes the search and the state filter. */
export function ideaPasses(i: FilterableIdea, f: IdeasFilters): boolean {
  return (f.states.length === 0 || f.states.includes(i.status)) && ideaMatchesSearch(i, termsOf(f.q));
}

/** The ideas that pass, in the same order. */
export function filterIdeas<T extends FilterableIdea>(ideas: readonly T[], f: IdeasFilters): T[] {
  const terms = termsOf(f.q);
  return ideas.filter((i) => (f.states.length === 0 || f.states.includes(i.status)) && ideaMatchesSearch(i, terms));
}

/** How many ideas there are per state among those that pass the search (the chip shows what would come from selecting it). */
export function countIdeasByState(ideas: readonly FilterableIdea[], f: IdeasFilters): Partial<Record<IdeaState, number>> {
  const terms = termsOf(f.q);
  const c: Partial<Record<IdeaState, number>> = {};
  for (const i of ideas) if (ideaMatchesSearch(i, terms)) c[i.status] = (c[i.status] ?? 0) + 1;
  return c;
}

/**
 * Escapes `text` (raw) and wraps the occurrences of the terms in `<mark>`, case-insensitively. It searches the
 * raw text and escapes each piece, so a term never splits an entity (`&amp;`) or comes in as HTML.
 */
export function highlight(text: string, terms: readonly string[]): string {
  const valid = terms.filter(Boolean);
  if (valid.length === 0) return escapeHtml(text);
  // The longest first: «f8-02» wins over «f8» at the same position.
  const fallback = [...valid]
    .sort((a, b) => b.length - a.length)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  let output = '';
  let finished = 0;
  for (const m of text.matchAll(new RegExp(fallback, 'gi'))) {
    if (m[0].length === 0) continue;
    output += `${escapeHtml(text.slice(finished, m.index))}<mark>${escapeHtml(m[0])}</mark>`;
    finished = m.index + m[0].length;
  }
  return output + escapeHtml(text.slice(finished));
}

import {
  countIdeasByState,
  countByState,
  highlight,
  filter,
  filterIdeas,
  activeFilters,
  activeNowFilters,
  activeIdeasFilters,
  EMPTY_NOW_FILTERS,
  EMPTY_IDEAS_FILTERS,
  EMPTY_FILTERS,
  passes,
  ideaPasses,
  termsOf,
  type Filters,
} from './filter';
import type { TaskView } from './view';

function task(extra: Partial<TaskView> = {}): TaskView {
  return {
    id: 'F8-02',
    title: 'Publicar a extensão',
    file: 'phase-8/F8-02.md',
    group: 'available',
    type: 'code',
    track: 'publicacao',
    tier: 'mid',
    repos: [],
    blockedBy: [],
    waitingOn: [],
    unblocks: [],
    pendingUnblocks: 0,
    started: null,
    finished: null,
    nextStep: null,
    phase: 'phase-8',
    depth: 0,
    duration: null,
    ...extra,
  };
}

const withFilters = (f: Partial<Filters>): Filters => ({ ...EMPTY_FILTERS, ...f });

describe('passes and filter', () => {
  it('without a filter, everything passes', () => {
    expect(passes(task(), EMPTY_FILTERS)).toBe(true);
    expect(activeFilters(EMPTY_FILTERS)).toBe(false);
  });

  it('the search is case-insensitive and looks at ID, title, track and type', () => {
    const t = task();
    expect(passes(t, withFilters({ q: 'f8' }))).toBe(true);
    expect(passes(t, withFilters({ q: 'EXTENSÃO' }))).toBe(true);
    expect(passes(t, withFilters({ q: 'Publicacao' }))).toBe(true);
    expect(passes(t, withFilters({ q: 'CODE' }))).toBe(true);
    expect(passes(t, withFilters({ q: 'F9' }))).toBe(false);
  });

  it('several words all apply, in any field', () => {
    expect(passes(task(), withFilters({ q: 'f8 code' }))).toBe(true);
    expect(passes(task(), withFilters({ q: 'f8 research' }))).toBe(false);
  });

  it('the search looks at the repos', () => {
    expect(passes(task({ repos: ['site'] }), withFilters({ q: 'site' }))).toBe(true);
  });

  it('combines status, track and tier', () => {
    const t = task({ group: 'draft', track: 'panel', tier: 'senior' });
    expect(passes(t, withFilters({ groups: ['draft'] }))).toBe(true);
    expect(passes(t, withFilters({ groups: ['draft', 'done'] }))).toBe(true);
    expect(passes(t, withFilters({ groups: ['done'] }))).toBe(false);
    expect(passes(t, withFilters({ groups: ['draft'], track: 'panel', tier: 'senior' }))).toBe(true);
    expect(passes(t, withFilters({ groups: ['draft'], track: 'panel', tier: 'mid' }))).toBe(false);
    expect(passes(t, withFilters({ track: 'ci' }))).toBe(false);
  });

  it('filter keeps the order', () => {
    const list = [task({ id: 'F1-01' }), task({ id: 'F2-01' }), task({ id: 'F1-02' })];
    expect(filter(list, withFilters({ q: 'f1' })).map((t) => t.id)).toEqual(['F1-01', 'F1-02']);
  });

  it('activeFilters sees each field', () => {
    expect(activeFilters(withFilters({ q: ' ' }))).toBe(false);
    expect(activeFilters(withFilters({ q: 'a' }))).toBe(true);
    expect(activeFilters(withFilters({ groups: ['done'] }))).toBe(true);
    expect(activeFilters(withFilters({ track: 'ci' }))).toBe(true);
    expect(activeFilters(withFilters({ tier: 'mid' }))).toBe(true);
  });
});

describe('abandoned', () => {
  it('the abandoned chip filters only them, and the count counts them apart from the cancelled ones', () => {
    const tasks = [task({ id: 'F1-01', group: 'abandoned' }), task({ id: 'F1-02', group: 'cancelled' }), task({ id: 'F1-03' })];
    expect(filter(tasks, withFilters({ groups: ['abandoned'] })).map((t) => t.id)).toEqual(['F1-01']);
    expect(countByState(tasks, EMPTY_FILTERS)).toEqual({ abandoned: 1, cancelled: 1, available: 1 });
  });
});

describe('countByState', () => {
  it('counts ignoring the status filter, but honoring the search, the track and the tier', () => {
    const list = [task({ id: 'A', group: 'draft' }), task({ id: 'B', group: 'draft', track: 'ci' }), task({ id: 'C', group: 'done' })];
    expect(countByState(list, withFilters({ groups: ['done'], track: 'publicacao' }))).toEqual({ draft: 1, done: 1 });
  });
});

describe('highlight', () => {
  it('wraps the term in mark, case-insensitively, and escapes the rest', () => {
    expect(highlight('Task F8-02 & mais', ['f8'])).toBe('Task <mark>F8</mark>-02 &amp; mais');
  });

  it('does not break entities: searching «amp» does not enter the generated «&amp;»', () => {
    expect(highlight('A & B', ['amp'])).toBe('A &amp; B');
    expect(highlight('A & B', ['&'])).toBe('A <mark>&amp;</mark> B');
  });

  it('a term like <script> does not inject HTML', () => {
    expect(highlight('use <script>x</script>', ['<script>'])).toBe('use <mark>&lt;script&gt;</mark>x&lt;/script&gt;');
    expect(highlight('text', ['<script>'])).toBe('text');
  });

  it('regular-expression metacharacters count as text', () => {
    expect(highlight('a.b (c) a+b', ['.', '(', '+'])).toBe('a<mark>.</mark>b <mark>(</mark>c) a<mark>+</mark>b');
  });

  it('without terms returns the escaped text', () => {
    expect(highlight('<b>', [])).toBe('&lt;b&gt;');
  });
});

describe('termsOf', () => {
  it('splits by space, ignores empty ones and repeats', () => {
    expect(termsOf('  f8   code F8 ')).toEqual(['f8', 'code']);
    expect(termsOf('')).toEqual([]);
  });
});

describe('ideas filters', () => {
  const ideas = [
    { id: 'painel-dados-novos.md', title: 'Dados novos no painel', status: 'open' as const },
    { id: 'avisos.md', title: 'Avisos além do painel', status: 'refining' as const },
    { id: 'velha.md', title: 'Plano antigo', status: 'mapped' as const },
  ];
  const idea = (i: number) => {
    const found = ideas[i];
    if (found === undefined) throw new Error(`no idea ${i}`);
    return found;
  };

  it('looks in the slug and the title, all the words, case-insensitively', () => {
    expect(filterIdeas(ideas, { ...EMPTY_IDEAS_FILTERS, q: 'PAINEL' }).map((i) => i.id)).toEqual(['painel-dados-novos.md', 'avisos.md']);
    expect(filterIdeas(ideas, { ...EMPTY_IDEAS_FILTERS, q: 'dados-novos' }).map((i) => i.id)).toEqual(['painel-dados-novos.md']);
    expect(ideaPasses(idea(1), { ...EMPTY_IDEAS_FILTERS, q: 'avisos painel' })).toBe(true);
    expect(ideaPasses(idea(1), { ...EMPTY_IDEAS_FILTERS, q: 'avisos dados' })).toBe(false);
  });

  it('filters by state; empty is «all»', () => {
    expect(filterIdeas(ideas, { q: '', states: ['open', 'mapped'] }).map((i) => i.id)).toEqual(['painel-dados-novos.md', 'velha.md']);
    expect(filterIdeas(ideas, EMPTY_IDEAS_FILTERS)).toHaveLength(3);
  });

  it('counts by state among those that pass the search (the chip shows what would come)', () => {
    expect(countIdeasByState(ideas, { q: 'painel', states: ['open'] })).toEqual({ open: 1, refining: 1 });
  });

  it('active filter: a search of spaces does not count', () => {
    expect(activeIdeasFilters({ q: '  ', states: [] })).toBe(false);
    expect(activeIdeasFilters({ q: '', states: ['ready'] })).toBe(true);
  });
});

describe('Now filters', () => {
  it('empty by default; the search, a chip or the plan activate them', () => {
    expect(activeNowFilters(EMPTY_NOW_FILTERS)).toBe(false);
    expect(activeNowFilters({ ...EMPTY_NOW_FILTERS, q: 'x' })).toBe(true);
    expect(activeNowFilters({ ...EMPTY_NOW_FILTERS, groups: ['owner'] })).toBe(true);
    expect(activeNowFilters({ ...EMPTY_NOW_FILTERS, plan: 'p' })).toBe(true);
  });
});

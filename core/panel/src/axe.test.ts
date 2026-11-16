// @vitest-environment happy-dom
// The panel and the give-up confirmation under axe-core, a rule engine for accessibility: the WCAG 2.x A and AA rules
// over the DOM the page draws, inside the real document (lang, title, <main>). The best-practice rules about a whole
// web page (one <h1>, every block inside a landmark) do not apply to an editor side bar and stay out. The contrast
// rule cannot measure here (happy-dom does no layout) and the panel takes every color from the host theme, so axe
// leaves it as "incomplete", which this test does not count.
import axe from 'axe-core';
import { stringsFor } from '@plan-relay/i18n';
import { bindConfirmation, confirmationHtml } from './confirmation';
import { confirmationDocument, panelDocument } from './document';
import { ideasView } from './view';
import type { IdeaInput } from './input';
import { bindPanel, SAVED_VERSION, type HostChannel } from './page';

const RESOURCES = { nonce: 'n0', script: 'page.js', style: 'panel.css', origin: 'https://host.test' };
const STRINGS = stringsFor('pt-BR');
const PID = '/ws/agent_plans/a';

const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Title ${id}`,
  file: `phase-0/${id}.md`,
  group: 'available',
  type: 'code',
  track: 'panel',
  tier: 'mid',
  repos: [],
  blockedBy: [],
  waitingOn: [],
  unblocks: [],
  pendingUnblocks: 0,
  started: null,
  finished: null,
  nextStep: null,
  phase: 'phase-0',
  depth: 0,
  duration: null,
  ...extra,
});

// One task of each group the panel draws differently.
const TASKS = [
  task('F1-01', { unblocks: ['F1-05'] }),
  task('F1-02', { group: 'in-progress', started: '2026-01-01T10:00Z', nextStep: 'write the test' }),
  task('F1-03', { group: 'owner', type: 'decision' }),
  task('F1-04', { group: 'done', finished: '2026-01-01T11:00Z' }),
  task('F1-05', { group: 'blocked', blockedBy: ['F1-01'], waitingOn: ['F1-01'] }),
  task('F1-06', { group: 'cancelled', replacement: 'F1-01' }),
  task('F1-07', { group: 'abandoned', ownerGiveUp: true }),
  task('F1-08', { group: 'draft' }),
];
const STATUS = {
  type: 'status',
  updated: '10:42',
  plans: [
    {
      id: PID,
      name: 'a',
      pct: 13,
      done: 1,
      total: TASKS.length,
      phases: [
        {
          title: 'phase-0',
          dir: 'phase-0',
          done: 1,
          total: TASKS.length,
          pct: 13,
          inProgress: 1,
          abandoned: false,
          counts: {},
          tasks: TASKS,
        },
      ],
      tasks: TASKS,
      parallel: ['F1-01'],
    },
  ],
};

function idea(slug: string, status: IdeaInput['status'], over: Partial<IdeaInput> = {}): IdeaInput {
  return { file: `/ws/agent_plans/_ideas/${slug}.md`, slug, title: `Idea ${slug}`, status, openQuestions: 0, plan: null, ...over };
}
const IDEAS = ideasView(
  [idea('o', 'open', { openQuestions: 2 }), idea('r', 'ready'), idea('m', 'mapped', { plan: 'agent_plans/a/' })],
  ['refine', 'map', 'open', 'new', 'folder'],
);

/**
 * Puts the document the host serves in place of the test one: its `lang`, its title and its body, without the script.
 * The stylesheet link goes before parsing: happy-dom would try to fetch it.
 */
function load(html: string): void {
  const parsed = new DOMParser().parseFromString(html.replace(/<link rel="stylesheet"[^>]*>/, ''), 'text/html');
  document.documentElement.lang = parsed.documentElement.lang;
  document.title = parsed.title;
  document.body.replaceChildren(
    ...[...parsed.body.children].filter((e) => e.tagName !== 'SCRIPT').map((e) => document.importNode(e, true)),
  );
}

/** The panel page as the webview runs it, with `saved` as the state the host kept. */
function panelPage(saved: Record<string, unknown>): HTMLElement {
  load(panelDocument(RESOURCES, STRINGS));
  const root = document.getElementById('panel');
  if (!root) throw new Error('the panel document has no #panel');
  const channel: HostChannel = {
    send: () => {},
    onReceive: () => () => {},
    readSaved: () => ({ version: SAVED_VERSION, ...saved }),
    save: () => {},
  };
  bindPanel(root, channel, STRINGS);
  return root;
}

/** Each WCAG A/AA rule the current document breaks, with the HTML of the nodes and what axe asks to fix. */
async function violations(): Promise<string[]> {
  const result = await axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.html} ${n.failureSummary ?? ''}`).join(' | ')}`);
}

describe('axe-core over the panel', () => {
  it('Plans, with the card and the phase open and one task of each group: no violation', async () => {
    panelPage({ expanded: [PID], last: STATUS, openPhases: { [PID]: ['phase-0'] } });
    expect(await violations()).toEqual([]);
  });

  it('the detail dialog of a task: no violation', async () => {
    const root = panelPage({ expanded: [PID], last: STATUS, openPhases: { [PID]: ['phase-0'] } });
    const item = root.querySelector<HTMLElement>(`[data-action="detail"][data-id="F1-01"]`);
    if (!item) throw new Error('no tree item for F1-01');
    item.click();
    expect(root.querySelector('dialog')?.open).toBe(true);
    expect(await violations()).toEqual([]);
  });

  it('Now: no violation', async () => {
    panelPage({ tab: 'now', last: STATUS });
    expect(await violations()).toEqual([]);
  });

  it('Ideas, with every section open: no violation', async () => {
    panelPage({ tab: 'ideas', last: { ...STATUS, ideas: IDEAS }, openPhases: { '\u0000ideas': ['open', 'ready', 'mapped'] } });
    expect(await violations()).toEqual([]);
  });

  it('the give-up confirmation, also with the error of an invalid reason shown: no violation', async () => {
    const preview = {
      root: 'F1-01',
      falls: [
        { id: 'F1-01', title: 'Root', status: 'ready', phase: 'phase-0', parent: null, depth: 0, also_depends_on: [] },
        { id: 'F1-05', title: 'Child', status: 'ready', phase: 'phase-0', parent: 'F1-01', depth: 1, also_depends_on: [] },
      ],
      abandoned_phases: [],
    };
    load(confirmationDocument(RESOURCES, 'Give up F1-01', confirmationHtml({ preview, phases: {} }, STRINGS), STRINGS));
    const root = document.getElementById('confirmation');
    if (!root) throw new Error('the confirmation document has no #confirmation');
    bindConfirmation(root, () => {});
    expect(await violations()).toEqual([]);
    root.querySelector<HTMLElement>('[data-action="abandon"]')?.click();
    expect(root.querySelector<HTMLElement>('[role="alert"]')?.hidden).toBe(false);
    expect(await violations()).toEqual([]);
  });

  it('fails on a planted violation: a button without an accessible name', async () => {
    const root = panelPage({ expanded: [PID], last: STATUS, openPhases: { [PID]: ['phase-0'] } });
    root.append(document.createElement('button'));
    expect(await violations()).toEqual([expect.stringMatching(/^button-name: <button>/)]);
  });
});

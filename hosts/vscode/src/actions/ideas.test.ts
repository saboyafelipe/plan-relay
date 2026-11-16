// The actions of the "Ideas" section: the target comes from the last read, "Refine" and "Create tasks" open the agent, and
// "Create tasks" on an idea with open questions (or an unknown count) warns and lets the user proceed.
import { describe, expect, it } from 'vitest';
import { claudeCodePrompt } from '../agents/claude-code/prompts';
import { ideaTarget, createTasksFromIdea, newIdea, ideasFolder, startRefine, type IdeaTarget } from './ideas';
import type { ActionDeps } from './execute';
import type { PlanNotice } from './map';
import type { ModalOption } from './modal';
import { stringsFor } from '@plan-relay/i18n';

const PT = stringsFor('pt-BR');

function idea(slug: string, status: IdeaTarget['status'], openQuestions: number | null = 0): IdeaTarget {
  return { folder: '/ws', file: `/ws/agent_plans/_ideas/${slug}.md`, slug, title: slug, status, openQuestions };
}

const IDEAS = [
  idea('a', 'refining', 2),
  idea('b', 'ready', 0),
  idea('c', 'mapped', 0),
  idea('d', 'invalid', null),
  idea('e', 'open', null),
];

function ideaAt(index: number): IdeaTarget {
  const found = IDEAS[index];
  if (found === undefined) throw new Error(`no idea at ${index}`);
  return found;
}

describe('ideaTarget', () => {
  it('accepts the idea from the last read; refine and map refuse mapped and invalid, open accepts all', () => {
    expect(ideaTarget(IDEAS, '/ws/agent_plans/_ideas/a.md', 'refine')).toMatchObject({ idea: { slug: 'a' } });
    expect(ideaTarget(IDEAS, '/ws/agent_plans/_ideas/e.md', 'map')).toMatchObject({ idea: { slug: 'e' } });
    for (const slug of ['c', 'd']) {
      expect(ideaTarget(IDEAS, `/ws/agent_plans/_ideas/${slug}.md`, 'open')).toMatchObject({ idea: { slug } });
    }
    expect(ideaTarget(IDEAS, '/ws/agent_plans/_ideas/c.md', 'refine', PT)).toEqual({
      error: 'afinar: a ideia c não tem essa ação (mapped)',
    });
    expect(ideaTarget(IDEAS, '/ws/agent_plans/_ideas/d.md', 'map', PT)).toEqual({ error: 'mapear: a ideia d não tem essa ação (invalid)' });
  });

  it('refuses what does not come from the last read', () => {
    expect(ideaTarget(IDEAS, '/outro/x.md', 'open', PT)).toEqual({ error: 'abrir: ideia desconhecida /outro/x.md' });
  });
});

interface Recorder {
  notices: PlanNotice[];
  options: (readonly ModalOption[])[];
  opened: { prompt: string; folder: string }[];
}

function deps(answer: ModalOption | undefined, plugin = true): { d: ActionDeps; r: Recorder } {
  const r: Recorder = { notices: [], options: [], opened: [] };
  const d: ActionDeps = {
    prompt: claudeCodePrompt,
    plugin: () => Promise.resolve(plugin),
    ask: (notice, options) => {
      r.notices.push(notice);
      r.options.push(options);
      return Promise.resolve(answer);
    },
    openAgent: (prompt, folder) => {
      r.opened.push({ prompt, folder });
      return Promise.resolve('terminal');
    },
    channel: { info: () => {}, warn: () => {} },
    strings: PT,
  };
  return { d, r };
}

describe('startRefine', () => {
  it('opens the agent with the refine skill and the idea file relative to the workspace folder', async () => {
    const { d, r } = deps(undefined);
    expect(await startRefine(ideaAt(0), d)).toBe('opened');
    expect(r.opened).toEqual([{ prompt: '/plan-relay:refine agent_plans/_ideas/a.md', folder: '/ws' }]);
  });

  it('without the plugin it opens nothing', async () => {
    const { d, r } = deps(undefined, false);
    expect(await startRefine(ideaAt(0), d)).toBe('no-plugin');
    expect(r.opened).toEqual([]);
  });
});

describe('createTasksFromIdea', () => {
  it('without open questions it opens the agent with the map skill, without a warning', async () => {
    const { d, r } = deps(undefined);
    expect(await createTasksFromIdea(ideaAt(1), d)).toBe('opened');
    expect(r.notices).toEqual([]);
    expect(r.opened).toEqual([{ prompt: '/plan-relay:map agent_plans/_ideas/b.md', folder: '/ws' }]);
  });

  it('with open questions it warns, with "Create anyway", and proceeds when the person confirms', async () => {
    const { d, r } = deps('map-anyway');
    expect(await createTasksFromIdea(ideaAt(0), d)).toBe('opened');
    expect(r.notices[0]?.text).toBe('A ideia «a» tem 2 perguntas em aberto.');
    expect(r.options).toEqual([['map-anyway']]);
    expect(r.opened).toHaveLength(1);
  });

  it('with an unknown count it also warns', async () => {
    const { d, r } = deps('map-anyway');
    await createTasksFromIdea(ideaAt(4), d);
    expect(r.notices[0]?.text).toBe('Não se sabe quantas perguntas em aberto a ideia «e» tem.');
    expect(r.opened).toHaveLength(1);
  });

  it('"Cancel" (or another answer) does not open the agent', async () => {
    const { d, r } = deps(undefined);
    expect(await createTasksFromIdea(ideaAt(0), d)).toBe('cancelled');
    expect(r.opened).toEqual([]);
  });

  it('without the plugin it neither asks nor opens', async () => {
    const { d, r } = deps('map-anyway', false);
    expect(await createTasksFromIdea(ideaAt(0), d)).toBe('no-plugin');
    expect(r.notices).toEqual([]);
    expect(r.opened).toEqual([]);
  });
});

describe('novaIdeia', () => {
  it('opens the agent with the idea skill, without an argument, in the given folder', async () => {
    const { d, r } = deps(undefined);
    expect(await newIdea('/ws', d)).toBe('opened');
    expect(r.opened).toEqual([{ prompt: '/plan-relay:idea', folder: '/ws' }]);
  });

  it('without the plugin it stops, like "Refine"', async () => {
    const { d, r } = deps(undefined, false);
    expect(await newIdea('/ws', d)).toBe('no-plugin');
    expect(r.opened).toEqual([]);
  });
});

describe('pastaDasIdeias', () => {
  it('the workspace folder of the ideas read; without ideas, the first workspace folder; without any, nothing', () => {
    expect(ideasFolder([idea('a', 'open')], ['/outra', '/ws'])).toBe('/ws');
    expect(ideasFolder([], ['/primeira', '/segunda'])).toBe('/primeira');
    expect(ideasFolder([], [])).toBeUndefined();
  });
});

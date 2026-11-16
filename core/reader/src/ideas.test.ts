import { discoverIdeas, readIdea, type DiscoveredIdea } from './ideas';
import type { Files } from './files';

function inMemory(tree: Record<string, string | null>): Files {
  // `null` marks a folder; text, a file. Paths with `/`.
  return {
    join: (...p) => p.join('/'),
    async list(folder) {
      const children = new Map<string, boolean>();
      let exists = false;
      for (const [path, content] of Object.entries(tree)) {
        if (path === folder) exists = true;
        if (!path.startsWith(folder + '/')) continue;
        exists = true;
        const rest = path.slice(folder.length + 1).split('/');
        children.set(rest[0] ?? '', rest.length > 1 || content === null);
      }
      return exists ? [...children].map(([name, directory]) => ({ name, directory })) : undefined;
    },
    async read(file) {
      const v = tree[file];
      return typeof v === 'string' ? v : undefined;
    },
  };
}

const HEADER = 'Status: open\nCreated: 2026-11-14T10:00Z\nOpen questions: 2\n\n# Exportar o plano\n\ncorpo\n';

describe('readIdea', () => {
  it('reads the whole header', () => {
    expect(readIdea(HEADER, 'exportar')).toEqual({
      slug: 'exportar',
      title: 'Exportar o plano',
      status: 'open',
      created: '2026-11-14T10:00Z',
      openQuestions: 2,
      plan: null,
    });
  });

  it('each valid status', () => {
    for (const s of ['open', 'refining', 'ready']) {
      expect(readIdea(`Status: ${s}\n\n# T\n`, 'x').status).toBe(s);
    }
  });

  it('mapped carries the Plan:', () => {
    const i = readIdea('Status: mapped\nPlan: agent_plans/novo\n\n# T\n', 'x');
    expect(i).toMatchObject({ status: 'mapped', plan: 'agent_plans/novo' });
  });

  it('Plan: outside mapped is ignored', () => {
    expect(readIdea('Status: ready\nPlan: agent_plans/novo\n\n# T\n', 'x').plan).toBeNull();
  });

  it('mapped without Plan: gives a null plan', () => {
    expect(readIdea('Status: mapped\n\n# T\n', 'x')).toMatchObject({ status: 'mapped', plan: null });
  });

  it('a repeated key counts the last', () => {
    const i = readIdea('Status: ready\nStatus: open\nOpen questions: 1\nOpen questions: 5\n\n# T\n', 'x');
    expect(i).toMatchObject({ status: 'open', openQuestions: 5 });
  });

  it('an unknown key and blank lines in the header are ignored', () => {
    const i = readIdea('Status: open\n\nOutra: 1\nCreated: 2026-11-14T10:00Z\n\n# T\n', 'x');
    expect(i).toMatchObject({ status: 'open', created: '2026-11-14T10:00Z' });
  });

  it('without `# ` the title is the slug', () => {
    expect(readIdea('Status: open\nOpen questions: 0\n', 'meu-slug').title).toBe('meu-slug');
  });

  it('after the title nothing is header', () => {
    const i = readIdea('Status: open\n\n# T\nOpen questions: 9\nCreated: 2026-11-14T10:00Z\n', 'x');
    expect(i).toMatchObject({ openQuestions: null, created: null });
  });

  it('a malformed or missing Created: gives a null date', () => {
    expect(readIdea('Status: open\nCreated: ontem\n\n# T\n', 'x').created).toBeNull();
    expect(readIdea('Status: open\nCreated: 2026-11-14\n\n# T\n', 'x').created).toBeNull();
    expect(readIdea('Status: open\n\n# T\n', 'x').created).toBeNull();
  });

  it('a non-numeric or missing Open questions: gives null; zero is zero', () => {
    expect(readIdea('Status: open\nOpen questions: muitas\n\n# T\n', 'x').openQuestions).toBeNull();
    expect(readIdea('Status: open\nOpen questions: -1\n\n# T\n', 'x').openQuestions).toBeNull();
    expect(readIdea('Status: open\nOpen questions: 1.5\n\n# T\n', 'x').openQuestions).toBeNull();
    expect(readIdea('Status: open\n\n# T\n', 'x').openQuestions).toBeNull();
    expect(readIdea('Status: open\nOpen questions: 0\n\n# T\n', 'x').openQuestions).toBe(0);
  });

  it('an invalid or missing Status: gives invalid with the text read', () => {
    const a = readIdea('Status: pronto\n\n# T\n', 'x');
    expect(a).toMatchObject({ status: 'invalid', text: 'Status: pronto\n\n# T\n' });
    const b = readIdea('Created: 2026-11-14T10:00Z\n\n# T\n', 'x');
    expect(b).toMatchObject({ status: 'invalid', created: '2026-11-14T10:00Z', title: 'T' });
    expect(b.text).toBeDefined();
  });

  it('the text only comes when invalid', () => {
    expect(readIdea(HEADER, 'x')).not.toHaveProperty('text');
  });

  it('CRLF does not enter the value', () => {
    const i = readIdea('Status: open\r\nOpen questions: 3\r\n\r\n# T\r\n', 'x');
    expect(i).toMatchObject({ status: 'open', openQuestions: 3, title: 'T' });
  });
});

describe('discoverIdeas', () => {
  const ROOT = '/w/agent_plans/_ideas';

  it('reads the ideas of each folder, ordered by folder and slug', async () => {
    const files = inMemory({
      [`${ROOT}/b.md`]: HEADER,
      [`${ROOT}/a.md`]: 'Status: ready\nOpen questions: 0\n\n# A\n',
      '/v/agent_plans/_ideas/c.md': HEADER,
    });
    const r = await discoverIdeas(files, ['/w', '/v']);
    expect(r.map((i: DiscoveredIdea) => [i.folder, i.slug, i.file])).toEqual([
      ['/w', 'a', `${ROOT}/a.md`],
      ['/w', 'b', `${ROOT}/b.md`],
      ['/v', 'c', '/v/agent_plans/_ideas/c.md'],
    ]);
    expect(r[0]).toMatchObject({ title: 'A', status: 'ready', openQuestions: 0 });
  });

  it('a file starting with _ or ., a non-.md file and a folder are not ideas', async () => {
    const files = inMemory({
      [`${ROOT}/_template.md`]: HEADER,
      [`${ROOT}/.oculta.md`]: HEADER,
      [`${ROOT}/nota.txt`]: HEADER,
      [`${ROOT}/sub/x.md`]: HEADER,
      [`${ROOT}/boa.md`]: HEADER,
    });
    const r = await discoverIdeas(files, ['/w']);
    expect(r.map((i) => i.slug)).toEqual(['boa']);
  });

  it('a missing _ideas/ gives an empty list', async () => {
    expect(await discoverIdeas(inMemory({ '/w/agent_plans/p/plan.json': '{}' }), ['/w'])).toEqual([]);
    expect(await discoverIdeas(inMemory({}), ['/w'])).toEqual([]);
  });

  it('an unreadable _ideas/ becomes one invalid entry with the error, not an empty list', async () => {
    const base = inMemory({ [`${ROOT}/x.md`]: HEADER, '/v/agent_plans/_ideas/y.md': HEADER });
    const files: Files = {
      ...base,
      async list(folder) {
        if (folder === ROOT) throw new Error('EACCES');
        return base.list(folder);
      },
    };
    const r = await discoverIdeas(files, ['/w', '/v']);
    expect(r.map((i) => [i.folder, i.slug, i.status])).toEqual([
      ['/w', '_ideas', 'invalid'],
      ['/v', 'y', 'open'],
    ]);
    expect(r[0]).toMatchObject({ file: ROOT, text: 'EACCES' });
  });

  it('an invalid idea appears with the text read', async () => {
    const files = inMemory({ [`${ROOT}/x.md`]: 'sem cabeçalho\n' });
    const [i] = await discoverIdeas(files, ['/w']);
    expect(i).toMatchObject({ slug: 'x', status: 'invalid', title: 'x', text: 'sem cabeçalho\n' });
  });

  it('an unreadable file becomes invalid and does not bring the list down', async () => {
    const base = inMemory({ [`${ROOT}/x.md`]: HEADER, [`${ROOT}/y.md`]: HEADER });
    const files: Files = {
      ...base,
      async read(a) {
        if (a.endsWith('x.md')) throw new Error('EACCES');
        return base.read(a);
      },
    };
    const r = await discoverIdeas(files, ['/w']);
    expect(r.map((i) => [i.slug, i.status])).toEqual([
      ['x', 'invalid'],
      ['y', 'open'],
    ]);
    expect(r[0]?.text).toBe('EACCES');
  });
});

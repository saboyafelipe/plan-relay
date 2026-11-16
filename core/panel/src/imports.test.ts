// The panel modules import each other without cycles, type-only imports included: a cycle makes the load order
// matter and ties modules that should stand apart (the messages and the render share `types.ts` instead).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));
const FROM = /(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+'(\.{1,2}\/[^']+)'/g;

function modules(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.startsWith('testing'))
    .map((f) => join(SRC, f));
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(FROM)].map((m) => resolve(dirname(file), `${m[1]}.ts`));
}

/** The first cycle found, as a list of files relative to `src/`, or `undefined`. */
function firstCycle(graph: Map<string, string[]>): string[] | undefined {
  const state = new Map<string, 'open' | 'closed'>();
  const path: string[] = [];
  const visit = (node: string): string[] | undefined => {
    if (state.get(node) === 'closed') return undefined;
    if (state.get(node) === 'open') return [...path.slice(path.indexOf(node)), node];
    state.set(node, 'open');
    path.push(node);
    for (const next of graph.get(node) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    path.pop();
    state.set(node, 'closed');
    return undefined;
  };
  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle.map((f) => relative(SRC, f));
  }
  return undefined;
}

describe('panel imports', () => {
  it('finds a cycle when there is one (the check itself)', () => {
    const graph = new Map([
      ['/a.ts', ['/b.ts']],
      ['/b.ts', ['/a.ts']],
    ]);
    expect(firstCycle(graph)).toBeDefined();
  });

  it('have no cycle', () => {
    const graph = new Map(modules().map((f) => [f, importsOf(f)]));
    expect(graph.size).toBeGreaterThan(10);
    expect(firstCycle(graph)).toBeUndefined();
  });
});

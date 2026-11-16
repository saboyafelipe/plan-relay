// Test helper: builds throwaway plans from the template fixture (core/template/tests)
// and the real template scripts, and copies the example project plan. The extension tests
// use the same helper.
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');

export const TEMPLATE = join(ROOT, 'core', 'template');
export const TEMPLATE_STATUS = join(TEMPLATE, 'status.sh');
const FIXTURE = join(TEMPLATE, 'tests', 'fixture', 'agent_plans', 'test-plan');
const SCRIPTS = ['status.sh', 'task.sh', 'map.sh'];

export function temporaryFolder(): { folder: string; remove: () => void } {
  const folder = mkdtempSync(join(tmpdir(), 'plan-relay-test-'));
  return { folder, remove: () => rmSync(folder, { recursive: true, force: true }) };
}

/**
 * Copies the fixture to `<root>/agent_plans/<name>/`, adds the template scripts and writes
 * plan.json (the given `planJson` replaces the generated one; a string is written as is).
 * Returns the plan folder.
 */
export function createPlan(root: string, name = 'test-plan', planJson?: string | Record<string, unknown>): string {
  const folder = join(root, 'agent_plans', name);
  mkdirSync(join(root, 'agent_plans'), { recursive: true });
  cpSync(FIXTURE, folder, { recursive: true });
  for (const script of SCRIPTS) {
    cpSync(join(TEMPLATE, script), join(folder, script));
  }
  const content =
    typeof planJson === 'string' ? planJson : JSON.stringify(planJson ?? { contract: 1, name, source: null, created: '2026-11-13T15:00Z' });
  writeFileSync(join(folder, 'plan.json'), content);
  return folder;
}

/** The plan of the example project of the repository, which you open to see the panel. */
export const EXAMPLE = join(ROOT, 'fixtures', 'demo-project', 'agent_plans', 'site-de-receitas');

/** Copies the example project plan, as it is, to `<root>/agent_plans/`. Returns the folder. */
export function copyExample(root: string): string {
  const folder = join(root, 'agent_plans', 'site-de-receitas');
  cpSync(EXAMPLE, folder, { recursive: true });
  return folder;
}

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { claudeCodePrompt } from './prompts';

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..', '..');

describe('claudeCodePrompt', () => {
  it('map: the map skill with the .md relative to the workspace folder', () => {
    expect(claudeCodePrompt({ map: 'docs/PLANO-X.md' })).toBe('/plan-relay:map docs/PLANO-X.md');
  });

  it('refine: the refine skill with the idea file; map accepts the same file', () => {
    expect(claudeCodePrompt({ refine: 'agent_plans/_ideas/minha-ideia.md' })).toBe('/plan-relay:refine agent_plans/_ideas/minha-ideia.md');
    expect(claudeCodePrompt({ map: 'agent_plans/_ideas/minha-ideia.md' })).toBe('/plan-relay:map agent_plans/_ideas/minha-ideia.md');
  });

  it('plan: the plan skill with the plan folder and the ID (subtasks with the full ID)', () => {
    expect(claudeCodePrompt({ plan: 'build-harness', id: 'F1-03' })).toBe('/plan-relay:plan build-harness F1-03');
    expect(claudeCodePrompt({ plan: 'site-de-receitas', id: 'F4-04.1.2' })).toBe('/plan-relay:plan site-de-receitas F4-04.1.2');
  });

  it('run: the run skill with the plan folder from the root', () => {
    expect(claudeCodePrompt({ run: 'site-de-receitas' })).toBe('/plan-relay:run agent_plans/site-de-receitas');
  });

  it('with the pt-BR package installed: the prefix of plan-relay-pt-br', () => {
    expect(claudeCodePrompt({ plan: 'site-de-receitas', id: 'F1-03' }, 'plan-relay-pt-br')).toBe(
      '/plan-relay-pt-br:plan site-de-receitas F1-03',
    );
    expect(claudeCodePrompt({ run: 'site-de-receitas' }, 'plan-relay-pt-br')).toBe('/plan-relay-pt-br:run agent_plans/site-de-receitas');
    expect(claudeCodePrompt({ idea: true }, 'plan-relay-pt-br')).toBe('/plan-relay-pt-br:idea');
  });

  it('the skills cited exist in the adapter, and plan accepts "<plan> [ID]"', () => {
    for (const skill of ['map', 'plan', 'run', 'refine']) {
      const text = readFileSync(resolve(ROOT, 'agents', 'claude-code', 'skills', skill, 'SKILL.md'), 'utf8');
      expect(text, skill).toContain(`name: ${skill}`);
    }
    const plan = readFileSync(resolve(ROOT, 'agents', 'claude-code', 'skills', 'plan', 'SKILL.md'), 'utf8');
    expect(plan).toContain('argument-hint: "<plano> [ID]"');
  });
});

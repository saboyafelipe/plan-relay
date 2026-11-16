// describe, it and expect come from the vitest globals.
import { validateStatus, validatePlanJson } from './contract';

/** The first task of a status built by `validStatus`, to mutate it. */
function firstTask(status: Record<string, unknown>): Record<string, unknown> {
  const task = (status.tasks as Record<string, unknown>[])[0];
  if (task === undefined) throw new Error('the status has no task');
  return task;
}

function validStatus(): Record<string, unknown> {
  return {
    contract: 1,
    name: 'p',
    language: 'pt-BR',
    profile: 'full',
    scripts_version: 4,
    progress: { done: 1, total: 2, pct: 50, in_progress: 1, draft: 0 },
    phases: [{ dir: 'phase-0-a', title: 'Fase 0 — A', done: 1, total: 2, in_progress: 1 }],
    tasks: [
      {
        id: 'F0-01',
        title: 't',
        status: 'in-progress',
        type: 'code',
        track: 'x',
        repos: ['r'],
        blocked_by: [],
        waiting_on: [],
        group: 'in-progress',
        unblocks: 0,
        started: '2026-11-13T10:00Z',
        finished: null,
        next_step: null,
        file: 'phase-0-a/F0-01.md',
      },
    ],
    parallel: [],
    run: null,
  };
}

describe('validateStatus', () => {
  it('accepts a status that conforms to contract 1', () => {
    expect(validateStatus(validStatus())).not.toHaveProperty('error');
  });

  it('ignores extra fields', () => {
    const x = validStatus();
    x.extra = 'new';
    firstTask(x).other = 3;
    const r = validateStatus(x);
    expect(r).not.toHaveProperty('error');
    expect(r).not.toHaveProperty('extra');
    if ('error' in r) return;
    expect(r.tasks[0]).not.toHaveProperty('other');
  });

  it('refuses a contract other than 1', () => {
    const r = validateStatus({ ...validStatus(), contract: 2 });
    expect(r).toEqual({ error: { code: 'wrongContract', args: ['2'] } });
  });

  it('refuses a missing required field', () => {
    const x = validStatus();
    delete x.progress;
    expect(validateStatus(x)).toEqual({ error: { code: 'missing', args: ['progress'] } });
  });

  it('accepts a null scripts_version and refuses a stamp that is not an integer', () => {
    expect(validateStatus({ ...validStatus(), scripts_version: null })).toMatchObject({ scripts_version: null });
    expect(validateStatus({ ...validStatus(), scripts_version: '4' })).toEqual({
      error: { code: 'notIntegerNorNull', args: ['status.scripts_version'] },
    });
  });

  it('reads a normalized tier: absent (scripts older than version 6) or unknown counts as senior', () => {
    const tier = (v: unknown) => {
      const x = validStatus();
      if (v !== undefined) firstTask(x).tier = v;
      const r = validateStatus(x);
      if ('error' in r) throw new Error(JSON.stringify(r.error));
      return r.tasks[0]?.tier;
    };
    expect(tier(undefined)).toBe('senior');
    expect(tier('junior')).toBe('junior');
    expect(tier('mid')).toBe('mid');
    expect(tier('senior')).toBe('senior');
    expect(tier('Mid')).toBe('senior');
    expect(tier(3)).toBe('senior');
  });

  it('refuses a wrong type inside a task', () => {
    const x = validStatus();
    firstTask(x).unblocks = '0';
    expect(validateStatus(x)).toEqual({ error: { code: 'notNumber', args: ['tasks[0].unblocks'] } });
  });

  it('refuses a group that the contract does not know', () => {
    const x = validStatus();
    firstTask(x).group = 'outro';
    expect(validateStatus(x)).toEqual({ error: { code: 'unknownGroup', args: ['tasks[0].group', 'outro'] } });
  });

  it('accepts the nine groups of the contract', () => {
    for (const group of ['in-progress', 'available', 'owner', 'blocked', 'draft', 'done', 'cancelled', 'abandoned', 'invalid']) {
      const x = validStatus();
      firstTask(x).group = group;
      expect(validateStatus(x)).not.toHaveProperty('error');
    }
  });

  it('accepts run as an object', () => {
    const r = validateStatus({ ...validStatus(), run: { log: 'notes/run-x.md', open: false } });
    expect(r).toMatchObject({ run: { log: 'notes/run-x.md', open: false } });
  });

  it('run.handoff: text or null; without the key (status.sh up to stamp 7) it is null; another type refuses', () => {
    const withText = validateStatus({ ...validStatus(), run: { log: 'notes/run-x.md', open: true, handoff: '2026-11-14 18:47' } });
    expect(withText).toMatchObject({ run: { handoff: '2026-11-14 18:47' } });
    const withNull = validateStatus({ ...validStatus(), run: { log: 'notes/run-x.md', open: true, handoff: null } });
    expect(withNull).toMatchObject({ run: { handoff: null } });
    const old = validateStatus({ ...validStatus(), run: { log: 'notes/run-x.md', open: true } });
    expect(old).toMatchObject({ run: { handoff: null } });
    const wrong = validateStatus({ ...validStatus(), run: { log: 'notes/run-x.md', open: true, handoff: 3 } });
    expect(wrong).toEqual({ error: { code: 'notTextNorNull', args: ['run.handoff'] } });
  });

  it('refuses the --json of the old contract', () => {
    const old = {
      contrato: 1,
      name: 'p',
      progress: { total: 2, pct: 50 },
      phases: [],
      tasks: [],
      parallel: [],
      piloto: null,
    };
    expect(validateStatus(old)).toHaveProperty('error');
  });

  it('refuses what is not an object', () => {
    expect(validateStatus(null)).toHaveProperty('error');
    expect(validateStatus([])).toHaveProperty('error');
  });
});

describe('validatePlanJson', () => {
  it('accepts a conforming plan.json', () => {
    expect(validatePlanJson({ contract: 1, name: 'a', source: null, created: '2026-11-13T15:00Z' })).toEqual({
      contract: 1,
      name: 'a',
      source: null,
      created: '2026-11-13T15:00Z',
    });
  });

  it('ignores extra fields (language, for example)', () => {
    const r = validatePlanJson({ contract: 1, name: 'a', source: 'docs/x.md', created: 'x', language: 'pt-BR' });
    expect(r).toEqual({ contract: 1, name: 'a', source: 'docs/x.md', created: 'x' });
  });

  it('refuses a contract other than 1 and a missing name', () => {
    expect(validatePlanJson({ contract: 2, name: 'a', source: null, created: 'x' })).toHaveProperty('error');
    expect(validatePlanJson({ contract: 1, source: null, created: 'x' })).toHaveProperty('error');
  });

  it('refuses the keys of the old contract', () => {
    expect(validatePlanJson({ contrato: 1, name: 'a', origin: null, criado: 'x' })).toHaveProperty('error');
  });
});

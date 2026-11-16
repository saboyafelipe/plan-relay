// The graph of cancel, giveUp and reopen (core/contract/contract.md, «Cancel, give up and reopen»)
// over in-memory tasks. The cases of edits/ and reasons.json run in conformance.test.ts.
// describe, it and expect come from the vitest globals.
import {
  dependents,
  giveUpClosure,
  reopenClosure,
  isValidReason,
  normalizeReason,
  canCancel,
  cancelRefusal,
  type GraphTask,
} from './give-up';

/** A test task: the phase comes from the number of the ID (`F2-01` → `phase-2-f2`). */
function t(id: string, status: string, blocked_by: string[] = [], extra: Partial<GraphTask> = {}): GraphTask {
  const phase = `phase-${id.slice(1, id.indexOf('-'))}-f${id.slice(1, id.indexOf('-'))}`;
  return { id, title: `T ${id}`, status, blocked_by, file: `${phase}/${id}-x.md`, ...extra };
}

function preview(tasks: GraphTask[], id: string) {
  const r = giveUpClosure(tasks, id);
  if ('refusal' in r) throw new Error(JSON.stringify(r.refusal));
  return r;
}

describe('giveUpClosure', () => {
  it('x → y → z crossing a phase: the tree in pre-order and the phase that ends up abandoned', () => {
    const tasks = [t('F1-01', 'done'), t('F1-02', 'ready', ['F1-01']), t('F2-01', 'ready', ['F1-02']), t('F2-02', 'draft', ['F2-01'])];
    expect(preview(tasks, 'F1-02')).toEqual({
      root: 'F1-02',
      falls: [
        { id: 'F1-02', title: 'T F1-02', status: 'ready', phase: 'phase-1-f1', parent: null, depth: 0, also_depends_on: [] },
        { id: 'F2-01', title: 'T F2-01', status: 'ready', phase: 'phase-2-f2', parent: 'F1-02', depth: 1, also_depends_on: [] },
        { id: 'F2-02', title: 'T F2-02', status: 'draft', phase: 'phase-2-f2', parent: 'F2-01', depth: 2, also_depends_on: [] },
      ],
      abandoned_phases: ['phase-2-f2'],
    });
  });

  it('a child with two parents: falls once, under the first that reaches it; the other live parent goes in also_depends_on', () => {
    const tasks = [
      t('F1-01', 'ready'),
      t('F1-02', 'ready'),
      t('F1-03', 'ready', ['F1-01']),
      t('F1-04', 'ready', ['F1-03', 'F1-01']),
      t('F1-05', 'ready', ['F1-04', 'F1-02', 'F1-99']),
      t('F1-06', 'ready', ['F1-01', 'F1-07']),
      t('F1-07', 'done'),
    ];
    const p = preview(tasks, 'F1-01');
    expect(p.falls.map((f) => [f.id, f.parent, f.depth])).toEqual([
      ['F1-01', null, 0],
      ['F1-03', 'F1-01', 1],
      ['F1-04', 'F1-01', 1],
      ['F1-05', 'F1-04', 2],
      ['F1-06', 'F1-01', 1],
    ]);
    // F1-02 stays alive; F1-99 does not exist (not a live task); F1-07 is done.
    expect(p.falls.find((f) => f.id === 'F1-05')?.also_depends_on).toEqual(['F1-02']);
    expect(p.falls.find((f) => f.id === 'F1-06')?.also_depends_on).toEqual([]);
    expect(p.abandoned_phases).toEqual([]);
  });

  it('a cancelled or abandoned dependent does not enter, and the closure does not pass through it', () => {
    const tasks = [
      t('F1-01', 'ready'),
      t('F1-02', 'cancelled', ['F1-01']),
      t('F1-03', 'abandoned', ['F1-01']),
      t('F1-04', 'ready', ['F1-02']),
    ];
    expect(preview(tasks, 'F1-01').falls.map((f) => f.id)).toEqual(['F1-01']);
  });

  it('a cycle in Blocked by: does not hang the closure', () => {
    const tasks = [t('F1-01', 'ready', ['F1-02']), t('F1-02', 'ready', ['F1-01'])];
    expect(preview(tasks, 'F1-01').falls.map((f) => f.id)).toEqual(['F1-01', 'F1-02']);
  });

  it('refuses when an in-progress or done task would fall, naming them in the order of the preview', () => {
    const tasks = [
      t('F1-01', 'ready'),
      t('F1-02', 'ready', ['F1-01']),
      t('F1-03', 'done', ['F1-01']),
      t('F1-04', 'in-progress', ['F1-02']),
    ];
    expect(giveUpClosure(tasks, 'F1-01')).toEqual({
      refusal: { key: 'task.giveupStuck', args: ['F1-01', 'F1-04 (in-progress), F1-03 (done)'] },
    });
  });

  it('refuses the root outside ready and draft; accepts the blocked one (ready) and the draft', () => {
    expect(giveUpClosure([t('F1-01', 'in-progress')], 'F1-01')).toEqual({
      refusal: { key: 'task.giveupOnlyReadyOrDraft', args: ['F1-01', 'in-progress'] },
    });
    expect(giveUpClosure([t('F1-01', 'abandoned')], 'F1-01')).toEqual({
      refusal: { key: 'task.giveupOnlyReadyOrDraft', args: ['F1-01', 'abandoned'] },
    });
    expect(preview([t('F1-01', 'draft')], 'F1-01').falls).toHaveLength(1);
    expect(preview([t('F1-01', 'ready'), t('F1-02', 'ready', ['F1-01'])], 'F1-02').falls).toHaveLength(1);
    expect(giveUpClosure([t('F1-01', 'ready')], 'F1-09')).toEqual({ refusal: { key: 'task.notFound', args: ['F1-09'] } });
  });

  it('abandoned phase: only the one left entirely out with none done, and only if it was not one already', () => {
    const tasks = [
      t('F1-01', 'ready'),
      t('F2-01', 'ready', ['F1-01']),
      t('F2-02', 'cancelled'),
      t('F3-01', 'ready', ['F1-01']),
      t('F3-02', 'done'),
      t('F4-01', 'abandoned', [], { given_up_by: 'owner' }),
    ];
    expect(preview(tasks, 'F1-01').abandoned_phases).toEqual(['phase-1-f1', 'phase-2-f2']);
  });
});

describe('dependents and canCancel', () => {
  const tasks = [
    t('F1-01', 'ready'),
    t('F1-02', 'ready', ['F1-01']),
    t('F1-03', 'cancelled', ['F1-01']),
    t('F1-04', 'abandoned', ['F1-01']),
    t('F1-05', 'done', ['F1-01']),
    t('F1-06', 'ready'),
  ];

  it('dependents: whoever cites the ID in Blocked by:, in plan order', () => {
    expect(dependents(tasks, 'F1-01').map((x) => x.id)).toEqual(['F1-02', 'F1-03', 'F1-04', 'F1-05']);
  });

  it('canCancel: the live dependents (done included), or none', () => {
    expect(canCancel(tasks, 'F1-01')).toEqual(['F1-02', 'F1-05']);
    expect(canCancel(tasks, 'F1-06')).toEqual([]);
  });

  it('cancelRefusal: in contract order', () => {
    expect(cancelRefusal(tasks, 'F1-05', undefined, 'ok')).toEqual({ key: 'task.cancelOnlyLive', args: ['F1-05', 'done'] });
    expect(cancelRefusal(tasks, 'F1-01', 'F1-01', 'ok')).toEqual({ key: 'task.invalidReplacement', args: ['F1-01', 'F1-01'] });
    expect(cancelRefusal(tasks, 'F1-01', 'F1-99', 'ok')).toEqual({ key: 'task.invalidReplacement', args: ['F1-01', 'F1-99'] });
    expect(cancelRefusal(tasks, 'F1-01', 'F1-06', '-')).toEqual({ key: 'task.cancelHasDependents', args: ['F1-01', 'F1-02, F1-05'] });
    expect(cancelRefusal(tasks, 'F1-06', undefined, '-')).toEqual({ key: 'task.invalidReason', args: [] });
    expect(cancelRefusal(tasks, 'F1-06', undefined, 'Outra')).toBeUndefined();
  });
});

describe('reopenClosure', () => {
  const tasks = [
    t('F1-01', 'abandoned', [], { given_up_by: 'owner' }),
    t('F1-02', 'abandoned', ['F1-01'], { given_up_with: 'F1-01' }),
    t('F1-03', 'cancelled', ['F1-01']),
    t('F1-04', 'abandoned', ['F1-01'], { given_up_with: 'F1-09' }),
    t('F1-05', 'ready', [], { given_up_with: 'F1-01' }),
    t('F1-09', 'abandoned', []),
  ];

  it('brings back the root and those that fell with it; the cancelled one and the one from another give-up stay', () => {
    const r = reopenClosure(tasks, 'F1-01');
    if ('refusal' in r) throw new Error(JSON.stringify(r.refusal));
    expect(r.map((x) => x.id)).toEqual(['F1-01', 'F1-02']);
  });

  it('refuses the one that is not abandoned and the one that fell with a root', () => {
    expect(reopenClosure(tasks, 'F1-03')).toEqual({ refusal: { key: 'task.reopenOnlyAbandoned', args: ['F1-03', 'cancelled'] } });
    expect(reopenClosure(tasks, 'F1-02')).toEqual({ refusal: { key: 'task.reopenAtRoot', args: ['F1-02', 'F1-01'] } });
  });

  it('an abandoned task without Given up with: is a root, with or without Given up by:', () => {
    const r = reopenClosure(tasks, 'F1-09');
    if ('refusal' in r) throw new Error(JSON.stringify(r.refusal));
    expect(r.map((x) => x.id)).toEqual(['F1-09', 'F1-04']);
  });
});

describe('the reason', () => {
  it('normalizes space, tab, LF and CR; the non-breaking space is not a space', () => {
    expect(normalizeReason('  Sem   máquina\tWindows \r\n disponível  ')).toBe('Sem máquina Windows disponível');
    expect(normalizeReason('a b ')).toBe('a b');
  });

  it('refuses empty and every word of a single character, repeated or not (in code points)', () => {
    for (const m of ['', ' ', '-', 'a', '1', 'aaaaaaaaa', '--------', 'aaaaaaaaa bbbbbbb 1111111 --------', 'ééé ããã', ' ', '😀😀']) {
      expect(isValidReason(m), JSON.stringify(m)).toBe(false);
    }
    for (const m of ['Sem máquina Windows disponível', 'ab', 'a bc', 'éa', 'a\u00a0b', '😀a']) {
      expect(isValidReason(m), JSON.stringify(m)).toBe(true);
    }
  });
});

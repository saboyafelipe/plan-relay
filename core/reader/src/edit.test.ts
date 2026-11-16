// The text that the verbs write (contract.md, «What the verbs write») in the cases that conformance/edits/
// does not cover. describe, it and expect come from the vitest globals.
import { appendToLog, rewriteHeader } from './edit';

describe('appendToLog', () => {
  it('empty section at the end: the entry comes after ## Log and a blank line', () => {
    expect(appendToLog('Status: ready\n\n# F1-01 - A\n\n## Log\n', 'e')).toBe('Status: ready\n\n# F1-01 - A\n\n## Log\n\n- e\n');
  });

  it('empty section before another section: the blank line that separated them stays', () => {
    expect(appendToLog('# F1-01 - A\n\n## Log\n\n## Notas\n', 'e')).toBe('# F1-01 - A\n\n## Log\n\n- e\n\n## Notas\n');
  });

  it('after the last non-empty line of the section; ### does not close the section, ## does', () => {
    const before = '# F1-01 - A\n\n## Log\n\n### dia\n- Feito: x\n\n## Notas\n\ntexto\n';
    expect(appendToLog(before, 'e')).toBe('# F1-01 - A\n\n## Log\n\n### dia\n- Feito: x\n- e\n\n## Notas\n\ntexto\n');
  });

  it('a ## Log above the title does not count; without a section, the blank lines at the end are removed', () => {
    expect(appendToLog('## Log\n# F1-01 - A\n\ntexto\n\n\n', 'e')).toBe('## Log\n# F1-01 - A\n\ntexto\n\n## Log\n\n- e\n');
  });

  it('a file without a line break at the end now ends with one', () => {
    expect(appendToLog('# F1-01 - A\n\n## Log\n\n- antes', 'e')).toBe('# F1-01 - A\n\n## Log\n\n- antes\n- e\n');
  });
});

describe('rewriteHeader', () => {
  it('replaces line 1, removes the verb keys only from the header and puts the new ones right after Status:', () => {
    const before =
      'Status: abandoned\nType: code\nGiven up with: F1-01\n\nPrevious status: draft\nBlocked by: F1-01\n\n# F1-02 - B\n\nReplaced by: fica\n';
    expect(rewriteHeader(before, 'cancelled', ['Replaced by: F1-09'])).toBe(
      'Status: cancelled\nReplaced by: F1-09\nType: code\n\nBlocked by: F1-01\n\n# F1-02 - B\n\nReplaced by: fica\n',
    );
  });
});

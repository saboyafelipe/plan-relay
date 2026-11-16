import { stringsFor } from '@plan-relay/i18n';
import { since, minutesBetween } from './duration';

const PT = stringsFor('pt-BR');

const now = new Date(Date.UTC(2026, 10, 13, 16, 0));

describe('desde', () => {
  it('minutes', () => {
    expect(since('2026-11-13T15:57Z', now, PT)).toBe('há 3 min');
    expect(since('2026-11-13T16:00Z', now, PT)).toBe('há 0 min');
  });

  it('hours and minutes', () => {
    expect(since('2026-11-13T13:55Z', now, PT)).toBe('há 2 h 5 min');
    expect(since('2026-11-13T14:00Z', now, PT)).toBe('há 2 h');
  });

  it('days and hours', () => {
    expect(since('2026-11-10T12:00Z', now, PT)).toBe('há 3 d 4 h');
    expect(since('2026-11-12T16:30Z', now, PT)).toBe('há 23 h 30 min');
    expect(since('2026-11-11T16:00Z', now, PT)).toBe('há 2 d');
  });

  it('a future date counts as now', () => {
    expect(since('2026-11-13T17:00Z', now, PT)).toBe('há 0 min');
  });

  it('null gives a dash', () => {
    expect(since(null, now)).toBe('—');
  });

  it('an invalid date gives a dash', () => {
    expect(since('ontem', now, PT)).toBe('—');
    expect(since('2026-13-01T10:00Z', now, PT)).toBe('—');
    expect(since('2026-02-30T10:00Z', now, PT)).toBe('—');
    expect(since('2026-11-13T10:00', now, PT)).toBe('—');
  });
});

describe('minutesBetween', () => {
  it('from start to finish, or up to an instant', () => {
    expect(minutesBetween('2026-11-13T10:00Z', '2026-11-13T12:05Z')).toBe(125);
    expect(minutesBetween('2026-11-13T15:30Z', now)).toBe(30);
  });

  it('without a start, without an end, an invalid date or an end before the start gives null', () => {
    expect(minutesBetween(null, now)).toBeNull();
    expect(minutesBetween('2026-11-13T10:00Z', null)).toBeNull();
    expect(minutesBetween('2026-02-30T10:00Z', now)).toBeNull();
    expect(minutesBetween('2026-11-13T17:00Z', now)).toBeNull();
  });
});

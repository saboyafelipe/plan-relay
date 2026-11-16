import { describe, expect, it } from 'vitest';
import { shouldReveal } from './first-run';

describe('shouldReveal', () => {
  it('reveals when not yet revealed and there are plans', () => {
    expect(shouldReveal(undefined, true)).toBe(true);
  });

  it('does not reveal when already revealed', () => {
    expect(shouldReveal(true, true)).toBe(false);
  });

  it('does not reveal without plans', () => {
    expect(shouldReveal(undefined, false)).toBe(false);
  });

  it('treats a stored false value as not yet revealed', () => {
    expect(shouldReveal(false, true)).toBe(true);
  });
});

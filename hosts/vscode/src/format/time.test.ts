import { describe, expect, it } from 'vitest';
import { hourMinute } from './time';

describe('hourMinute', () => {
  it('formats the local time with two digits', () => {
    expect(hourMinute(new Date(2026, 10, 13, 9, 5))).toBe('09:05');
    expect(hourMinute(new Date(2026, 10, 13, 23, 59))).toBe('23:59');
  });
});

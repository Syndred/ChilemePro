import { describe, it, expect } from 'vitest';
import { getProgressColor } from './CalorieProgress';

describe('getProgressColor', () => {
  it('returns warning color when intake exceeds 100% of target', () => {
    expect(getProgressColor(2100, 2000)).toBe('bg-destructive');
    expect(getProgressColor(3000, 2000)).toBe('bg-destructive');
  });

  it('returns normal green when intake is 80-100% of target', () => {
    expect(getProgressColor(1600, 2000)).toBe('bg-green-500');
    expect(getProgressColor(2000, 2000)).toBe('bg-green-500');
    expect(getProgressColor(1800, 2000)).toBe('bg-green-500');
  });

  it('returns primary color when intake is below 80%', () => {
    expect(getProgressColor(0, 2000)).toBe('bg-primary');
    expect(getProgressColor(1000, 2000)).toBe('bg-primary');
    expect(getProgressColor(1599, 2000)).toBe('bg-primary');
  });

  it('returns muted color when target is zero or negative', () => {
    expect(getProgressColor(500, 0)).toBe('bg-muted');
    expect(getProgressColor(0, 0)).toBe('bg-muted');
    expect(getProgressColor(100, -1)).toBe('bg-muted');
  });

  it('handles exact boundary at 80%', () => {
    // 80% of 2000 = 1600 → should be green
    expect(getProgressColor(1600, 2000)).toBe('bg-green-500');
  });

  it('handles exact boundary at 100%', () => {
    // 100% of 2000 = 2000 → should be green (not warning)
    expect(getProgressColor(2000, 2000)).toBe('bg-green-500');
  });

  it('handles just over 100%', () => {
    expect(getProgressColor(2001, 2000)).toBe('bg-destructive');
  });
});

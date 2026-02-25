import { describe, it, expect } from 'vitest';

/**
 * Unit tests for stats page utility functions.
 * Requirement 8.1: Weekly calorie trend chart
 * Requirement 8.2: Monthly calorie trend chart
 * Requirement 8.6: Calculate and display weight change trend
 */

// Extracted pure functions matching the stats page logic

function getDateRange(period: 'week' | 'month') {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  if (period === 'week') {
    start.setDate(start.getDate() - 6);
  } else {
    start.setDate(start.getDate() - 29);
  }
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function generateDateLabels(start: Date, end: Date): string[] {
  const labels: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    labels.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return labels;
}

function formatDateLabel(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

function calculateWeightTrend(weights: { weight: number }[]) {
  if (weights.length < 2) return null;
  const first = weights[0].weight;
  const last = weights[weights.length - 1].weight;
  const diff = last - first;
  return {
    diff: Math.round(diff * 10) / 10,
    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : ('same' as const),
  };
}

describe('getDateRange', () => {
  it('returns 7 days for week period', () => {
    const { start, end } = getDateRange('week');
    const labels = generateDateLabels(start, end);
    expect(labels).toHaveLength(7);
  });

  it('returns 30 days for month period', () => {
    const { start, end } = getDateRange('month');
    const labels = generateDateLabels(start, end);
    expect(labels).toHaveLength(30);
  });
});

describe('generateDateLabels', () => {
  it('generates correct number of labels for a week', () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-01-07');
    const labels = generateDateLabels(start, end);
    expect(labels).toHaveLength(7);
    expect(labels[0]).toBe('2024-01-01');
    expect(labels[6]).toBe('2024-01-07');
  });

  it('generates single label for same day', () => {
    const date = new Date('2024-06-15');
    const labels = generateDateLabels(date, date);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toBe('2024-06-15');
  });
});

describe('formatDateLabel', () => {
  it('formats date string to MM/DD', () => {
    expect(formatDateLabel('2024-01-05')).toBe('1/5');
    expect(formatDateLabel('2024-12-25')).toBe('12/25');
  });

  it('strips leading zeros', () => {
    expect(formatDateLabel('2024-03-09')).toBe('3/9');
  });
});

describe('calculateWeightTrend', () => {
  it('returns null for less than 2 records', () => {
    expect(calculateWeightTrend([])).toBeNull();
    expect(calculateWeightTrend([{ weight: 70 }])).toBeNull();
  });

  it('detects downward trend', () => {
    const result = calculateWeightTrend([
      { weight: 75 },
      { weight: 73 },
      { weight: 72 },
    ]);
    expect(result).toEqual({ diff: -3, direction: 'down' });
  });

  it('detects upward trend', () => {
    const result = calculateWeightTrend([
      { weight: 60 },
      { weight: 62.5 },
    ]);
    expect(result).toEqual({ diff: 2.5, direction: 'up' });
  });

  it('detects no change', () => {
    const result = calculateWeightTrend([
      { weight: 70 },
      { weight: 70 },
    ]);
    expect(result).toEqual({ diff: 0, direction: 'same' });
  });
});

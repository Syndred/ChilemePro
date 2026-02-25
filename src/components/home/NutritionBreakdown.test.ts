import { describe, it, expect } from 'vitest';
import { calculateMacroRatios } from './NutritionBreakdown';

describe('calculateMacroRatios', () => {
  it('calculates correct ratios using 4-9-4 calorie conversion', () => {
    // 50g protein = 200 cal, 30g fat = 270 cal, 100g carbs = 400 cal
    // total = 870 cal
    const result = calculateMacroRatios(50, 30, 100);
    expect(result.proteinPct).toBe(Math.round((200 / 870) * 100)); // 23
    expect(result.fatPct).toBe(Math.round((270 / 870) * 100));     // 31
    expect(result.carbsPct).toBe(Math.round((400 / 870) * 100));   // 46
  });

  it('returns all zeros when no intake', () => {
    const result = calculateMacroRatios(0, 0, 0);
    expect(result.proteinPct).toBe(0);
    expect(result.fatPct).toBe(0);
    expect(result.carbsPct).toBe(0);
  });

  it('handles protein-only intake', () => {
    const result = calculateMacroRatios(100, 0, 0);
    expect(result.proteinPct).toBe(100);
    expect(result.fatPct).toBe(0);
    expect(result.carbsPct).toBe(0);
  });

  it('handles fat-only intake', () => {
    const result = calculateMacroRatios(0, 50, 0);
    expect(result.fatPct).toBe(100);
    expect(result.proteinPct).toBe(0);
    expect(result.carbsPct).toBe(0);
  });

  it('handles equal grams — fat has higher caloric density', () => {
    // 10g each: protein=40cal, fat=90cal, carbs=40cal, total=170
    const result = calculateMacroRatios(10, 10, 10);
    expect(result.proteinPct).toBe(Math.round((40 / 170) * 100)); // 24
    expect(result.fatPct).toBe(Math.round((90 / 170) * 100));     // 53
    expect(result.carbsPct).toBe(Math.round((40 / 170) * 100));   // 24
  });
});

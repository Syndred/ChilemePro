import { describe, it, expect } from 'vitest';
import {
  isOverTarget,
  isUnderTarget,
  calculateMacroRatios,
  detectConsecutiveOverTarget,
  countConsecutiveOverTargetDays,
  generateCalorieSuggestions,
  generateNutritionRatioSuggestions,
  buildNutritionAnalysis,
  buildHealthAdvice,
  UNDER_TARGET_THRESHOLD,
  type DailyCalorieRecord,
  type DailyIntake,
} from './nutrition-analysis';

// ─── isOverTarget ──────────────────────────────────────────────

describe('isOverTarget', () => {
  it('returns true when calories exceed target', () => {
    expect(isOverTarget(2500, 2000)).toBe(true);
  });

  it('returns false when calories equal target', () => {
    expect(isOverTarget(2000, 2000)).toBe(false);
  });

  it('returns false when calories are below target', () => {
    expect(isOverTarget(1500, 2000)).toBe(false);
  });

  it('returns false when target is 0', () => {
    expect(isOverTarget(100, 0)).toBe(false);
  });

  it('returns false when target is negative', () => {
    expect(isOverTarget(100, -500)).toBe(false);
  });
});

// ─── isUnderTarget ─────────────────────────────────────────────

describe('isUnderTarget', () => {
  it('returns true when calories are below 80% of target', () => {
    // 80% of 2000 = 1600, so 1500 is under
    expect(isUnderTarget(1500, 2000)).toBe(true);
  });

  it('returns false when calories are exactly at 80% threshold', () => {
    expect(isUnderTarget(2000 * UNDER_TARGET_THRESHOLD, 2000)).toBe(false);
  });

  it('returns false when calories are above 80% of target', () => {
    expect(isUnderTarget(1800, 2000)).toBe(false);
  });

  it('returns false when target is 0', () => {
    expect(isUnderTarget(0, 0)).toBe(false);
  });
});

// ─── calculateMacroRatios ──────────────────────────────────────

describe('calculateMacroRatios', () => {
  it('calculates correct ratios for balanced intake', () => {
    // 100g protein = 400 cal, 50g fat = 450 cal, 150g carbs = 600 cal
    // total = 1450 cal
    const intake: DailyIntake = {
      totalCalories: 1450,
      totalProtein: 100,
      totalFat: 50,
      totalCarbs: 150,
    };
    const ratios = calculateMacroRatios(intake);

    expect(ratios.proteinRatio).toBeCloseTo(400 / 1450, 2);
    expect(ratios.fatRatio).toBeCloseTo(450 / 1450, 2);
    expect(ratios.carbsRatio).toBeCloseTo(600 / 1450, 2);
  });

  it('returns all zeros when no macros', () => {
    const intake: DailyIntake = {
      totalCalories: 0,
      totalProtein: 0,
      totalFat: 0,
      totalCarbs: 0,
    };
    const ratios = calculateMacroRatios(intake);
    expect(ratios.proteinRatio).toBe(0);
    expect(ratios.fatRatio).toBe(0);
    expect(ratios.carbsRatio).toBe(0);
  });

  it('ratios sum to approximately 1', () => {
    const intake: DailyIntake = {
      totalCalories: 2000,
      totalProtein: 80,
      totalFat: 70,
      totalCarbs: 250,
    };
    const ratios = calculateMacroRatios(intake);
    const sum = ratios.proteinRatio + ratios.fatRatio + ratios.carbsRatio;
    expect(sum).toBeCloseTo(1, 1);
  });
});


// ─── detectConsecutiveOverTarget ───────────────────────────────

describe('detectConsecutiveOverTarget', () => {
  it('returns true when last 3 days are all over target', () => {
    const records: DailyCalorieRecord[] = [
      { date: '2024-01-01', totalCalories: 2500, targetCalories: 2000 },
      { date: '2024-01-02', totalCalories: 2300, targetCalories: 2000 },
      { date: '2024-01-03', totalCalories: 2100, targetCalories: 2000 },
    ];
    expect(detectConsecutiveOverTarget(records)).toBe(true);
  });

  it('returns false when one of last 3 days is not over target', () => {
    const records: DailyCalorieRecord[] = [
      { date: '2024-01-01', totalCalories: 2500, targetCalories: 2000 },
      { date: '2024-01-02', totalCalories: 1800, targetCalories: 2000 },
      { date: '2024-01-03', totalCalories: 2100, targetCalories: 2000 },
    ];
    expect(detectConsecutiveOverTarget(records)).toBe(false);
  });

  it('returns false when fewer than 3 records', () => {
    const records: DailyCalorieRecord[] = [
      { date: '2024-01-01', totalCalories: 2500, targetCalories: 2000 },
      { date: '2024-01-02', totalCalories: 2300, targetCalories: 2000 },
    ];
    expect(detectConsecutiveOverTarget(records)).toBe(false);
  });

  it('returns false for empty records', () => {
    expect(detectConsecutiveOverTarget([])).toBe(false);
  });

  it('only checks the last N records', () => {
    const records: DailyCalorieRecord[] = [
      { date: '2024-01-01', totalCalories: 1500, targetCalories: 2000 }, // under
      { date: '2024-01-02', totalCalories: 2500, targetCalories: 2000 },
      { date: '2024-01-03', totalCalories: 2300, targetCalories: 2000 },
      { date: '2024-01-04', totalCalories: 2100, targetCalories: 2000 },
    ];
    expect(detectConsecutiveOverTarget(records)).toBe(true);
  });

  it('supports custom threshold', () => {
    const records: DailyCalorieRecord[] = [
      { date: '2024-01-01', totalCalories: 2500, targetCalories: 2000 },
      { date: '2024-01-02', totalCalories: 2300, targetCalories: 2000 },
    ];
    expect(detectConsecutiveOverTarget(records, 2)).toBe(true);
  });
});

// ─── countConsecutiveOverTargetDays ────────────────────────────

describe('countConsecutiveOverTargetDays', () => {
  it('counts consecutive over-target days from the end', () => {
    const records: DailyCalorieRecord[] = [
      { date: '2024-01-01', totalCalories: 1500, targetCalories: 2000 },
      { date: '2024-01-02', totalCalories: 2500, targetCalories: 2000 },
      { date: '2024-01-03', totalCalories: 2300, targetCalories: 2000 },
    ];
    expect(countConsecutiveOverTargetDays(records)).toBe(2);
  });

  it('returns 0 when last day is not over target', () => {
    const records: DailyCalorieRecord[] = [
      { date: '2024-01-01', totalCalories: 2500, targetCalories: 2000 },
      { date: '2024-01-02', totalCalories: 1800, targetCalories: 2000 },
    ];
    expect(countConsecutiveOverTargetDays(records)).toBe(0);
  });

  it('returns 0 for empty records', () => {
    expect(countConsecutiveOverTargetDays([])).toBe(0);
  });

  it('counts all days when all are over target', () => {
    const records: DailyCalorieRecord[] = [
      { date: '2024-01-01', totalCalories: 2500, targetCalories: 2000 },
      { date: '2024-01-02', totalCalories: 2300, targetCalories: 2000 },
      { date: '2024-01-03', totalCalories: 2100, targetCalories: 2000 },
      { date: '2024-01-04', totalCalories: 2200, targetCalories: 2000 },
    ];
    expect(countConsecutiveOverTargetDays(records)).toBe(4);
  });
});

// ─── generateCalorieSuggestions ────────────────────────────────

describe('generateCalorieSuggestions', () => {
  it('generates over-target suggestions with excess amount', () => {
    const result = generateCalorieSuggestions(2500, 2000);
    expect(result.mealSuggestions.length).toBeGreaterThan(0);
    expect(result.exerciseSuggestions.length).toBeGreaterThan(0);
    expect(result.mealSuggestions[0]).toContain('500');
  });

  it('generates under-target suggestions with deficit amount', () => {
    const result = generateCalorieSuggestions(1200, 2000);
    expect(result.mealSuggestions.length).toBeGreaterThan(0);
    expect(result.exerciseSuggestions.length).toBe(0);
    expect(result.mealSuggestions[0]).toContain('800');
  });

  it('returns empty suggestions when on target', () => {
    const result = generateCalorieSuggestions(1900, 2000);
    expect(result.mealSuggestions.length).toBe(0);
    expect(result.exerciseSuggestions.length).toBe(0);
  });
});

// ─── generateNutritionRatioSuggestions ─────────────────────────

describe('generateNutritionRatioSuggestions', () => {
  it('returns no-data message when all zeros', () => {
    const tips = generateNutritionRatioSuggestions({
      totalCalories: 0,
      totalProtein: 0,
      totalFat: 0,
      totalCarbs: 0,
    });
    expect(tips).toHaveLength(1);
    expect(tips[0]).toContain('暂无');
  });

  it('returns positive message for balanced intake', () => {
    // Roughly 25% protein, 25% fat, 50% carbs
    const tips = generateNutritionRatioSuggestions({
      totalCalories: 2000,
      totalProtein: 125,  // 500 cal = 25%
      totalFat: 56,       // 504 cal ≈ 25%
      totalCarbs: 250,    // 1000 cal = 50%
    });
    expect(tips.some((t) => t.includes('良好'))).toBe(true);
  });

  it('flags high fat intake', () => {
    const tips = generateNutritionRatioSuggestions({
      totalCalories: 2000,
      totalProtein: 50,
      totalFat: 120,  // 1080 cal from fat — very high
      totalCarbs: 150,
    });
    expect(tips.some((t) => t.includes('脂肪'))).toBe(true);
  });

  it('flags low protein intake', () => {
    const tips = generateNutritionRatioSuggestions({
      totalCalories: 2000,
      totalProtein: 20,   // very low
      totalFat: 50,
      totalCarbs: 350,
    });
    expect(tips.some((t) => t.includes('蛋白质') && t.includes('偏低'))).toBe(true);
  });
});

// ─── buildNutritionAnalysis ────────────────────────────────────

describe('buildNutritionAnalysis', () => {
  it('builds correct analysis for over-target intake', () => {
    const intake: DailyIntake = {
      totalCalories: 2500,
      totalProtein: 80,
      totalFat: 70,
      totalCarbs: 300,
    };
    const analysis = buildNutritionAnalysis(intake, 2000);

    expect(analysis.totalCalories).toBe(2500);
    expect(analysis.targetCalories).toBe(2000);
    expect(analysis.isOverTarget).toBe(true);
    expect(analysis.isUnderTarget).toBe(false);
    expect(analysis.suggestions.length).toBeGreaterThan(0);
  });

  it('builds correct analysis for under-target intake', () => {
    const intake: DailyIntake = {
      totalCalories: 1200,
      totalProtein: 40,
      totalFat: 30,
      totalCarbs: 150,
    };
    const analysis = buildNutritionAnalysis(intake, 2000);

    expect(analysis.isOverTarget).toBe(false);
    expect(analysis.isUnderTarget).toBe(true);
  });
});

// ─── buildHealthAdvice ─────────────────────────────────────────

describe('buildHealthAdvice', () => {
  const date = new Date('2024-06-15');

  it('returns "over" status when over target', () => {
    const advice = buildHealthAdvice(
      { totalCalories: 2500, totalProtein: 80, totalFat: 70, totalCarbs: 300 },
      2000,
      date,
    );
    expect(advice.calorieStatus).toBe('over');
    expect(advice.mealSuggestions.length).toBeGreaterThan(0);
    expect(advice.exerciseSuggestions.length).toBeGreaterThan(0);
  });

  it('returns "under" status when under target', () => {
    const advice = buildHealthAdvice(
      { totalCalories: 1200, totalProtein: 40, totalFat: 30, totalCarbs: 150 },
      2000,
      date,
    );
    expect(advice.calorieStatus).toBe('under');
    expect(advice.mealSuggestions.length).toBeGreaterThan(0);
  });

  it('returns "on_target" status when within range', () => {
    const advice = buildHealthAdvice(
      { totalCalories: 1900, totalProtein: 80, totalFat: 60, totalCarbs: 250 },
      2000,
      date,
    );
    expect(advice.calorieStatus).toBe('on_target');
  });

  it('includes the correct date', () => {
    const advice = buildHealthAdvice(
      { totalCalories: 2000, totalProtein: 80, totalFat: 60, totalCarbs: 250 },
      2000,
      date,
    );
    expect(advice.date).toBe(date);
  });
});

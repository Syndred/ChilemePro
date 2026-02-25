/**
 * Pure functions for nutrition analysis and health advice logic.
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 *
 * These functions contain no side effects and are fully testable.
 */

import type { NutritionAnalysis, HealthAdvice } from '@/types';

// ─── Constants ─────────────────────────────────────────────────

/** Ideal macronutrient ratios (percentage of total calories) */
export const IDEAL_RATIOS = {
  protein: 0.25, // 25%
  fat: 0.25,     // 25%
  carbs: 0.50,   // 50%
} as const;

/** Calories per gram for each macronutrient */
export const CALORIES_PER_GRAM = {
  protein: 4,
  fat: 9,
  carbs: 4,
} as const;

/** Threshold for "under target" — below 80% of target */
export const UNDER_TARGET_THRESHOLD = 0.8;

/** Number of consecutive over-target days to trigger a reminder */
export const CONSECUTIVE_OVER_DAYS_THRESHOLD = 3;

// ─── Input types ───────────────────────────────────────────────

export interface DailyIntake {
  totalCalories: number;
  totalProtein: number;
  totalFat: number;
  totalCarbs: number;
}

export interface DailyCalorieRecord {
  date: string; // ISO date string (YYYY-MM-DD)
  totalCalories: number;
  targetCalories: number;
}

// ─── Core analysis functions ───────────────────────────────────

/**
 * Determine if daily calories exceed the target.
 * Requirement 7.1: When daily calories exceed target
 */
export function isOverTarget(totalCalories: number, targetCalories: number): boolean {
  if (targetCalories <= 0) return false;
  return totalCalories > targetCalories;
}

/**
 * Determine if daily calories are insufficient (below 80% of target).
 * Requirement 7.2: When daily calories are insufficient
 */
export function isUnderTarget(totalCalories: number, targetCalories: number): boolean {
  if (targetCalories <= 0) return false;
  return totalCalories < targetCalories * UNDER_TARGET_THRESHOLD;
}

/**
 * Calculate macronutrient ratios as percentage of total calories.
 * Requirement 7.3: Analyze nutrition intake ratios
 *
 * Returns ratios as decimals (0-1). If total calories is 0, returns 0 for all.
 */
export function calculateMacroRatios(intake: DailyIntake): {
  proteinRatio: number;
  fatRatio: number;
  carbsRatio: number;
} {
  const proteinCalories = intake.totalProtein * CALORIES_PER_GRAM.protein;
  const fatCalories = intake.totalFat * CALORIES_PER_GRAM.fat;
  const carbsCalories = intake.totalCarbs * CALORIES_PER_GRAM.carbs;
  const totalFromMacros = proteinCalories + fatCalories + carbsCalories;

  if (totalFromMacros <= 0) {
    return { proteinRatio: 0, fatRatio: 0, carbsRatio: 0 };
  }

  return {
    proteinRatio: Math.round((proteinCalories / totalFromMacros) * 100) / 100,
    fatRatio: Math.round((fatCalories / totalFromMacros) * 100) / 100,
    carbsRatio: Math.round((carbsCalories / totalFromMacros) * 100) / 100,
  };
}


/**
 * Detect if a user has exceeded their calorie target for N consecutive days.
 * Requirement 7.5: When calories exceed target for 3 consecutive days, send reminder
 *
 * Records must be sorted by date ascending. Only the most recent consecutive
 * streak ending at the last record is considered.
 *
 * @param records - Daily calorie records sorted by date ascending
 * @param threshold - Number of consecutive days required (default: 3)
 * @returns true if the last `threshold` records are all over target
 */
export function detectConsecutiveOverTarget(
  records: DailyCalorieRecord[],
  threshold: number = CONSECUTIVE_OVER_DAYS_THRESHOLD,
): boolean {
  if (records.length < threshold) return false;

  // Check the last `threshold` records
  const recentRecords = records.slice(-threshold);
  return recentRecords.every((r) => isOverTarget(r.totalCalories, r.targetCalories));
}

/**
 * Count the current consecutive over-target streak from the end of the records.
 */
export function countConsecutiveOverTargetDays(records: DailyCalorieRecord[]): number {
  let count = 0;
  for (let i = records.length - 1; i >= 0; i--) {
    if (isOverTarget(records[i].totalCalories, records[i].targetCalories)) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// ─── Suggestion generators (pure, no AI) ──────────────────────

/**
 * Generate calorie-based suggestions.
 * Requirement 7.1: Suggest low-calorie meals and exercise when over target
 * Requirement 7.2: Recommend supplementary foods when under target
 */
export function generateCalorieSuggestions(
  totalCalories: number,
  targetCalories: number,
): { mealSuggestions: string[]; exerciseSuggestions: string[] } {
  const mealSuggestions: string[] = [];
  const exerciseSuggestions: string[] = [];

  if (isOverTarget(totalCalories, targetCalories)) {
    const excess = Math.round(totalCalories - targetCalories);
    mealSuggestions.push(
      `今日已超标 ${excess} 千卡，下一餐建议选择低热量食物`,
      '推荐：蔬菜沙拉、清蒸鱼、水煮鸡胸肉',
    );
    exerciseSuggestions.push(
      `建议进行约 ${Math.round(excess / 7)} 分钟慢跑消耗多余热量`,
      '或进行 30 分钟快走、游泳等有氧运动',
    );
  } else if (isUnderTarget(totalCalories, targetCalories)) {
    const deficit = Math.round(targetCalories - totalCalories);
    mealSuggestions.push(
      `今日摄入不足，还需补充约 ${deficit} 千卡`,
      '推荐：坚果、酸奶、全麦面包、香蕉',
    );
  }

  return { mealSuggestions, exerciseSuggestions };
}

/**
 * Generate nutrition ratio optimization suggestions.
 * Requirement 7.3: Analyze nutrition intake ratios and provide optimization suggestions
 */
export function generateNutritionRatioSuggestions(
  intake: DailyIntake,
): string[] {
  const { proteinRatio, fatRatio, carbsRatio } = calculateMacroRatios(intake);
  const tips: string[] = [];

  if (proteinRatio === 0 && fatRatio === 0 && carbsRatio === 0) {
    return ['今日暂无饮食记录，无法分析营养比例'];
  }

  // Protein analysis
  if (proteinRatio < IDEAL_RATIOS.protein - 0.05) {
    tips.push(
      `蛋白质摄入偏低（${Math.round(proteinRatio * 100)}%），建议增加鸡蛋、鱼肉、豆制品`,
    );
  } else if (proteinRatio > IDEAL_RATIOS.protein + 0.10) {
    tips.push(
      `蛋白质摄入偏高（${Math.round(proteinRatio * 100)}%），注意均衡搭配碳水和蔬菜`,
    );
  }

  // Fat analysis
  if (fatRatio > IDEAL_RATIOS.fat + 0.10) {
    tips.push(
      `脂肪摄入偏高（${Math.round(fatRatio * 100)}%），建议减少油炸食品，选择清蒸或水煮`,
    );
  }

  // Carbs analysis
  if (carbsRatio > IDEAL_RATIOS.carbs + 0.10) {
    tips.push(
      `碳水摄入偏高（${Math.round(carbsRatio * 100)}%），建议用粗粮替代精制主食`,
    );
  } else if (carbsRatio < IDEAL_RATIOS.carbs - 0.10) {
    tips.push(
      `碳水摄入偏低（${Math.round(carbsRatio * 100)}%），适当增加全谷物和薯类`,
    );
  }

  if (tips.length === 0) {
    tips.push('今日营养摄入比例良好，继续保持！');
  }

  return tips;
}

// ─── Composite analysis ────────────────────────────────────────

/**
 * Build a complete NutritionAnalysis from daily intake and target.
 * Requirement 7.3: Analyze nutrition intake ratios
 */
export function buildNutritionAnalysis(
  intake: DailyIntake,
  targetCalories: number,
): NutritionAnalysis {
  const { proteinRatio, fatRatio, carbsRatio } = calculateMacroRatios(intake);
  const suggestions = [
    ...generateNutritionRatioSuggestions(intake),
    ...generateCalorieSuggestions(intake.totalCalories, targetCalories).mealSuggestions,
  ];

  return {
    totalCalories: intake.totalCalories,
    targetCalories,
    proteinRatio,
    fatRatio,
    carbsRatio,
    isOverTarget: isOverTarget(intake.totalCalories, targetCalories),
    isUnderTarget: isUnderTarget(intake.totalCalories, targetCalories),
    suggestions,
  };
}

/**
 * Build a complete HealthAdvice from daily intake, target, and recent history.
 * Requirement 7.4: Generate personalized daily health advice
 */
export function buildHealthAdvice(
  intake: DailyIntake,
  targetCalories: number,
  date: Date,
): HealthAdvice {
  const over = isOverTarget(intake.totalCalories, targetCalories);
  const under = isUnderTarget(intake.totalCalories, targetCalories);

  let calorieStatus: HealthAdvice['calorieStatus'] = 'on_target';
  if (over) calorieStatus = 'over';
  else if (under) calorieStatus = 'under';

  const { mealSuggestions, exerciseSuggestions } = generateCalorieSuggestions(
    intake.totalCalories,
    targetCalories,
  );
  const nutritionTips = generateNutritionRatioSuggestions(intake);

  return {
    date,
    calorieStatus,
    mealSuggestions,
    exerciseSuggestions,
    nutritionTips,
  };
}

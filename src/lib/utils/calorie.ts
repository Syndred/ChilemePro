import type { Gender, ActivityLevel } from '@/types';

/**
 * Activity level multipliers for the Harris-Benedict equation.
 */
export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export interface CalorieInput {
  gender: Gender;
  weight: number;    // kg
  height: number;    // cm
  age: number;
  activityLevel: ActivityLevel;
}

/**
 * Calculate Basal Metabolic Rate using the Harris-Benedict formula.
 *
 * Male:   BMR = 88.362 + (13.397 × weight_kg) + (4.799 × height_cm) - (5.677 × age)
 * Female: BMR = 447.593 + (9.247 × weight_kg) + (3.098 × height_cm) - (4.330 × age)
 *
 * For 'other' gender, the average of male and female BMR is used.
 */
export function calculateBMR(
  gender: Gender,
  weight: number,
  height: number,
  age: number,
): number {
  if (gender === 'male') {
    return 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age;
  }
  if (gender === 'female') {
    return 447.593 + 9.247 * weight + 3.098 * height - 4.330 * age;
  }
  // 'other': average of male and female
  const maleBMR = 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age;
  const femaleBMR = 447.593 + 9.247 * weight + 3.098 * height - 4.330 * age;
  return (maleBMR + femaleBMR) / 2;
}

/**
 * Calculate daily recommended calorie target.
 *
 * dailyCalories = BMR × activityMultiplier
 *
 * Returns a rounded integer (kcal).
 */
export function calculateDailyCalories(input: CalorieInput): number {
  const { gender, weight, height, age, activityLevel } = input;
  const bmr = calculateBMR(gender, weight, height, age);
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel];
  return Math.round(bmr * multiplier);
}

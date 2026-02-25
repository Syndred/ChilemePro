import { describe, it, expect } from 'vitest';
import {
  calculateBMR,
  calculateDailyCalories,
  ACTIVITY_MULTIPLIERS,
  type CalorieInput,
} from './calorie';

describe('calculateBMR', () => {
  it('calculates male BMR correctly', () => {
    // Male, 70kg, 175cm, 30 years
    // BMR = 88.362 + (13.397 × 70) + (4.799 × 175) - (5.677 × 30)
    //     = 88.362 + 937.79 + 839.825 - 170.31
    //     = 1695.667
    const bmr = calculateBMR('male', 70, 175, 30);
    expect(bmr).toBeCloseTo(1695.667, 1);
  });

  it('calculates female BMR correctly', () => {
    // Female, 60kg, 165cm, 25 years
    // BMR = 447.593 + (9.247 × 60) + (3.098 × 165) - (4.330 × 25)
    //     = 447.593 + 554.82 + 511.17 - 108.25
    //     = 1405.333
    const bmr = calculateBMR('female', 60, 165, 25);
    expect(bmr).toBeCloseTo(1405.333, 1);
  });

  it('calculates "other" gender BMR as average of male and female', () => {
    const weight = 65;
    const height = 170;
    const age = 28;
    const maleBMR = calculateBMR('male', weight, height, age);
    const femaleBMR = calculateBMR('female', weight, height, age);
    const otherBMR = calculateBMR('other', weight, height, age);
    expect(otherBMR).toBeCloseTo((maleBMR + femaleBMR) / 2, 5);
  });

  it('returns higher BMR for heavier person (same gender/height/age)', () => {
    const light = calculateBMR('male', 60, 175, 30);
    const heavy = calculateBMR('male', 90, 175, 30);
    expect(heavy).toBeGreaterThan(light);
  });

  it('returns lower BMR for older person (same gender/weight/height)', () => {
    const young = calculateBMR('female', 60, 165, 20);
    const old = calculateBMR('female', 60, 165, 50);
    expect(young).toBeGreaterThan(old);
  });
});

describe('calculateDailyCalories', () => {
  it('applies sedentary multiplier correctly', () => {
    const input: CalorieInput = {
      gender: 'male',
      weight: 70,
      height: 175,
      age: 30,
      activityLevel: 'sedentary',
    };
    const bmr = calculateBMR('male', 70, 175, 30);
    const expected = Math.round(bmr * 1.2);
    expect(calculateDailyCalories(input)).toBe(expected);
  });

  it('applies very_active multiplier correctly', () => {
    const input: CalorieInput = {
      gender: 'female',
      weight: 55,
      height: 160,
      age: 25,
      activityLevel: 'very_active',
    };
    const bmr = calculateBMR('female', 55, 160, 25);
    const expected = Math.round(bmr * 1.9);
    expect(calculateDailyCalories(input)).toBe(expected);
  });

  it('returns higher calories for more active level', () => {
    const base: Omit<CalorieInput, 'activityLevel'> = {
      gender: 'male',
      weight: 75,
      height: 180,
      age: 35,
    };
    const sedentary = calculateDailyCalories({ ...base, activityLevel: 'sedentary' });
    const active = calculateDailyCalories({ ...base, activityLevel: 'active' });
    expect(active).toBeGreaterThan(sedentary);
  });

  it('returns a rounded integer', () => {
    const input: CalorieInput = {
      gender: 'male',
      weight: 73,
      height: 178,
      age: 27,
      activityLevel: 'moderate',
    };
    const result = calculateDailyCalories(input);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('all activity multipliers produce correct results', () => {
    const base = { gender: 'male' as const, weight: 70, height: 175, age: 30 };
    const bmr = calculateBMR(base.gender, base.weight, base.height, base.age);

    for (const [level, multiplier] of Object.entries(ACTIVITY_MULTIPLIERS)) {
      const result = calculateDailyCalories({
        ...base,
        activityLevel: level as CalorieInput['activityLevel'],
      });
      expect(result).toBe(Math.round(bmr * multiplier));
    }
  });
});

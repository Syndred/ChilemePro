import { describe, it, expect } from 'vitest';
import {
  calculateFoodNutrition,
  calculateMealTotals,
  calculateDailyTotals,
  type FoodNutritionInput,
  type MealTotalsInput,
} from './food-calorie';

describe('calculateFoodNutrition', () => {
  it('calculates nutrition for a single serving', () => {
    const input: FoodNutritionInput = {
      caloriesPerServing: 100,
      proteinPerServing: 10,
      fatPerServing: 5,
      carbsPerServing: 20,
      quantity: 1,
    };
    const result = calculateFoodNutrition(input);
    expect(result).toEqual({
      calories: 100,
      protein: 10,
      fat: 5,
      carbs: 20,
    });
  });

  it('scales nutrition linearly with quantity', () => {
    const input: FoodNutritionInput = {
      caloriesPerServing: 116,
      proteinPerServing: 2.6,
      fatPerServing: 0.3,
      carbsPerServing: 25.9,
      quantity: 2.5,
    };
    const result = calculateFoodNutrition(input);
    expect(result.calories).toBeCloseTo(290, 0);
    expect(result.protein).toBeCloseTo(6.5, 1);
    expect(result.fat).toBeCloseTo(0.75, 2);
    expect(result.carbs).toBeCloseTo(64.75, 1);
  });

  it('returns zero for zero quantity', () => {
    const input: FoodNutritionInput = {
      caloriesPerServing: 200,
      proteinPerServing: 15,
      fatPerServing: 8,
      carbsPerServing: 30,
      quantity: 0,
    };
    const result = calculateFoodNutrition(input);
    expect(result.calories).toBe(0);
    expect(result.protein).toBe(0);
    expect(result.fat).toBe(0);
    expect(result.carbs).toBe(0);
  });

  it('handles fractional quantities correctly', () => {
    const input: FoodNutritionInput = {
      caloriesPerServing: 100,
      proteinPerServing: 10,
      fatPerServing: 5,
      carbsPerServing: 20,
      quantity: 0.5,
    };
    const result = calculateFoodNutrition(input);
    expect(result.calories).toBe(50);
    expect(result.protein).toBe(5);
    expect(result.fat).toBe(2.5);
    expect(result.carbs).toBe(10);
  });

  it('rounds results to 2 decimal places', () => {
    const input: FoodNutritionInput = {
      caloriesPerServing: 33,
      proteinPerServing: 7,
      fatPerServing: 3,
      carbsPerServing: 11,
      quantity: 3,
    };
    const result = calculateFoodNutrition(input);
    // 33 * 3 = 99 (exact)
    expect(result.calories).toBe(99);
    // Check that all values have at most 2 decimal places
    const decimalPlaces = (n: number) => {
      const str = n.toString();
      const idx = str.indexOf('.');
      return idx === -1 ? 0 : str.length - idx - 1;
    };
    expect(decimalPlaces(result.calories)).toBeLessThanOrEqual(2);
    expect(decimalPlaces(result.protein)).toBeLessThanOrEqual(2);
    expect(decimalPlaces(result.fat)).toBeLessThanOrEqual(2);
    expect(decimalPlaces(result.carbs)).toBeLessThanOrEqual(2);
  });
});

describe('calculateMealTotals', () => {
  it('sums nutrition from multiple food items', () => {
    const foods: MealTotalsInput[] = [
      { calories: 116, protein: 2.6, fat: 0.3, carbs: 25.9 },
      { calories: 144, protein: 13.3, fat: 8.8, carbs: 2.8 },
      { calories: 36, protein: 4.1, fat: 0.6, carbs: 4.3 },
    ];
    const result = calculateMealTotals(foods);
    expect(result.calories).toBeCloseTo(296, 0);
    expect(result.protein).toBeCloseTo(20, 0);
    expect(result.fat).toBeCloseTo(9.7, 1);
    expect(result.carbs).toBeCloseTo(33, 0);
  });

  it('returns zeros for empty array', () => {
    const result = calculateMealTotals([]);
    expect(result).toEqual({
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
    });
  });

  it('returns same values for single food item', () => {
    const food: MealTotalsInput = { calories: 200, protein: 15, fat: 8, carbs: 30 };
    const result = calculateMealTotals([food]);
    expect(result.calories).toBe(200);
    expect(result.protein).toBe(15);
    expect(result.fat).toBe(8);
    expect(result.carbs).toBe(30);
  });
});

describe('calculateDailyTotals', () => {
  it('aggregates totals from multiple meals', () => {
    const meals: MealTotalsInput[] = [
      { calories: 400, protein: 20, fat: 10, carbs: 50 },  // breakfast
      { calories: 600, protein: 30, fat: 15, carbs: 70 },  // lunch
      { calories: 500, protein: 25, fat: 12, carbs: 60 },  // dinner
    ];
    const result = calculateDailyTotals(meals);
    expect(result.calories).toBe(1500);
    expect(result.protein).toBe(75);
    expect(result.fat).toBe(37);
    expect(result.carbs).toBe(180);
  });
});

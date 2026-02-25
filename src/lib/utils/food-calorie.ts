/**
 * Pure functions for food calorie and nutrition calculations.
 * Requirement 3.2: Calculate and display food calories and nutrition info
 */

export interface FoodNutritionInput {
  /** Calories per single serving unit */
  caloriesPerServing: number;
  /** Protein per single serving unit (grams) */
  proteinPerServing: number;
  /** Fat per single serving unit (grams) */
  fatPerServing: number;
  /** Carbs per single serving unit (grams) */
  carbsPerServing: number;
  /** Number of servings */
  quantity: number;
}

export interface FoodNutritionResult {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

/**
 * Calculate total nutrition for a food item based on per-serving values and quantity.
 * Formula: total = perServing * quantity
 * Results are rounded to 2 decimal places.
 */
export function calculateFoodNutrition(
  input: FoodNutritionInput,
): FoodNutritionResult {
  return {
    calories: Math.round(input.caloriesPerServing * input.quantity * 100) / 100,
    protein: Math.round(input.proteinPerServing * input.quantity * 100) / 100,
    fat: Math.round(input.fatPerServing * input.quantity * 100) / 100,
    carbs: Math.round(input.carbsPerServing * input.quantity * 100) / 100,
  };
}

export interface MealTotalsInput {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

/**
 * Calculate total nutrition for a meal from an array of food items.
 * Requirement 3.4: Update daily calorie statistics
 */
export function calculateMealTotals(
  foods: MealTotalsInput[],
): FoodNutritionResult {
  const totals = foods.reduce(
    (acc, food) => ({
      calories: acc.calories + food.calories,
      protein: acc.protein + food.protein,
      fat: acc.fat + food.fat,
      carbs: acc.carbs + food.carbs,
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  );

  return {
    calories: Math.round(totals.calories * 100) / 100,
    protein: Math.round(totals.protein * 100) / 100,
    fat: Math.round(totals.fat * 100) / 100,
    carbs: Math.round(totals.carbs * 100) / 100,
  };
}

/**
 * Calculate daily totals from multiple meal records.
 */
export function calculateDailyTotals(
  meals: MealTotalsInput[],
): FoodNutritionResult {
  return calculateMealTotals(meals);
}

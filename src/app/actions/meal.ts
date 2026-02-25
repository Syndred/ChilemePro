'use server';

import { createClient } from '@/lib/supabase/server';
import { createMealRecordSchema, updateMealRecordSchema } from '@/lib/validations/meal';
import { calculateMealTotals } from '@/lib/utils/food-calorie';
import type { MealRecord, FoodItem } from '@/types';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Map a database meal_record row + food_items to our MealRecord type.
 */
function mapMealRecord(
  row: Record<string, unknown>,
  foodRows: Record<string, unknown>[],
): MealRecord {
  const foods: FoodItem[] = foodRows.map((f) => ({
    id: f.id as string,
    mealRecordId: f.meal_record_id as string,
    name: f.name as string,
    calories: Number(f.calories),
    protein: Number(f.protein ?? 0),
    fat: Number(f.fat ?? 0),
    carbs: Number(f.carbs ?? 0),
    serving: Number(f.serving ?? 1),
    unit: (f.unit as string) ?? 'g',
    createdAt: new Date(f.created_at as string),
  }));

  return {
    id: row.id as string,
    userId: row.user_id as string,
    mealType: row.meal_type as MealRecord['mealType'],
    foods,
    totalCalories: Number(row.total_calories),
    totalProtein: Number(row.total_protein ?? 0),
    totalFat: Number(row.total_fat ?? 0),
    totalCarbs: Number(row.total_carbs ?? 0),
    imageUrl: (row.image_url as string) ?? null,
    recordedAt: new Date(row.recorded_at as string),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/**
 * Create a new meal record with food items.
 * Requirement 3.3: Save Meal_Record to database
 * Requirement 3.4: Update daily calorie statistics
 */
export async function createMealRecord(
  input: unknown,
): Promise<ActionResult<MealRecord>> {
  const parsed = createMealRecordSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { mealType, foods, imageUrl, recordedAt } = parsed.data;

  // Calculate totals from food items using pure function
  const totals = calculateMealTotals(foods);

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // Insert meal record
    const { data: mealRow, error: mealError } = await supabase
      .from('meal_records')
      .insert({
        user_id: user.id,
        meal_type: mealType,
        total_calories: totals.calories,
        total_protein: totals.protein,
        total_fat: totals.fat,
        total_carbs: totals.carbs,
        image_url: imageUrl ?? null,
        recorded_at: recordedAt.toISOString(),
      })
      .select()
      .single();

    if (mealError || !mealRow) {
      return { success: false, error: '保存饮食记录失败，请重试' };
    }

    // Insert food items
    const foodInserts = foods.map((food) => ({
      meal_record_id: mealRow.id,
      name: food.name,
      calories: food.calories,
      protein: food.protein,
      fat: food.fat,
      carbs: food.carbs,
      serving: food.serving,
      unit: food.unit,
    }));

    const { data: foodRows, error: foodError } = await supabase
      .from('food_items')
      .insert(foodInserts)
      .select();

    if (foodError) {
      // Rollback: delete the meal record if food items fail
      await supabase.from('meal_records').delete().eq('id', mealRow.id);
      return { success: false, error: '保存食物条目失败，请重试' };
    }

    return {
      success: true,
      data: mapMealRecord(mealRow, foodRows ?? []),
    };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Update an existing meal record.
 * Requirement 3.2: Calculate and display food calories and nutrition
 */
export async function updateMealRecord(
  id: string,
  input: unknown,
): Promise<ActionResult<MealRecord>> {
  if (!id) {
    return { success: false, error: '记录 ID 不能为空' };
  }

  const parsed = updateMealRecordSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { mealType, foods, imageUrl } = parsed.data;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from('meal_records')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (!existing || existing.user_id !== user.id) {
      return { success: false, error: '记录不存在或无权修改' };
    }

    // Build update payload
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (mealType) updatePayload.meal_type = mealType;
    if (imageUrl) updatePayload.image_url = imageUrl;

    // If foods are provided, recalculate totals and replace food items
    if (foods && foods.length > 0) {
      const totals = calculateMealTotals(foods);
      updatePayload.total_calories = totals.calories;
      updatePayload.total_protein = totals.protein;
      updatePayload.total_fat = totals.fat;
      updatePayload.total_carbs = totals.carbs;

      // Delete old food items
      await supabase.from('food_items').delete().eq('meal_record_id', id);

      // Insert new food items
      const foodInserts = foods.map((food) => ({
        meal_record_id: id,
        name: food.name,
        calories: food.calories,
        protein: food.protein,
        fat: food.fat,
        carbs: food.carbs,
        serving: food.serving,
        unit: food.unit,
      }));

      await supabase.from('food_items').insert(foodInserts);
    }

    // Update meal record
    const { data: updatedRow, error: updateError } = await supabase
      .from('meal_records')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updatedRow) {
      return { success: false, error: '更新失败，请重试' };
    }

    // Fetch updated food items
    const { data: foodRows } = await supabase
      .from('food_items')
      .select()
      .eq('meal_record_id', id);

    return {
      success: true,
      data: mapMealRecord(updatedRow, foodRows ?? []),
    };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Delete a meal record and its food items.
 * Requirement 6.4: Support editing or deleting history records
 * Requirement 6.5: Recalculate daily calorie statistics after deletion
 */
export async function deleteMealRecord(
  id: string,
): Promise<ActionResult> {
  if (!id) {
    return { success: false, error: '记录 ID 不能为空' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from('meal_records')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (!existing || existing.user_id !== user.id) {
      return { success: false, error: '记录不存在或无权删除' };
    }

    // food_items cascade delete via FK
    const { error } = await supabase
      .from('meal_records')
      .delete()
      .eq('id', id);

    if (error) {
      return { success: false, error: '删除失败，请重试' };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Get all meal records for a user on a specific date.
 * Requirement 6.1: Support viewing history records by date
 * Requirement 6.2: Show all Meal_Records for a selected day
 */
export async function getMealRecordsByDate(
  date: Date,
): Promise<ActionResult<MealRecord[]>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // Query records for the given date (start of day to end of day)
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const { data: mealRows, error } = await supabase
      .from('meal_records')
      .select('*')
      .eq('user_id', user.id)
      .gte('recorded_at', startOfDay.toISOString())
      .lte('recorded_at', endOfDay.toISOString())
      .order('recorded_at', { ascending: true });

    if (error) {
      return { success: false, error: '查询失败，请重试' };
    }

    if (!mealRows || mealRows.length === 0) {
      return { success: true, data: [] };
    }

    // Fetch food items for all meal records
    const mealIds = mealRows.map((r) => r.id);
    const { data: allFoodRows } = await supabase
      .from('food_items')
      .select('*')
      .in('meal_record_id', mealIds);

    const foodsByMeal = new Map<string, Record<string, unknown>[]>();
    for (const food of allFoodRows ?? []) {
      const mealId = food.meal_record_id as string;
      if (!foodsByMeal.has(mealId)) {
        foodsByMeal.set(mealId, []);
      }
      foodsByMeal.get(mealId)!.push(food);
    }

    const records = mealRows.map((row) =>
      mapMealRecord(row, foodsByMeal.get(row.id) ?? []),
    );

    return { success: true, data: records };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

'use server';

import { createClient } from '@/lib/supabase/server';
import { createMealRecordSchema, updateMealRecordSchema } from '@/lib/validations/meal';
import { calculateMealTotals } from '@/lib/utils/food-calorie';
import type { FoodItem, MealRecord } from '@/types';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface DailyCalorieStat {
  date: string;
  calories: number;
}

function parseDatabaseTimestamp(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value !== 'string') {
    return new Date();
  }

  const raw = value.trim();
  if (!raw) {
    return new Date();
  }

  // For `timestamp without time zone`, treat plain values as local time.
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(raw)) {
    return new Date(raw);
  }

  return new Date(raw.replace(' ', 'T'));
}

function formatLocalTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  const millisecond = String(date.getMilliseconds()).padStart(3, '0');

  return `${year}-${month}-${day} ${hour}:${minute}:${second}.${millisecond}`;
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseMealImageUrls(imageField: unknown): string[] {
  if (typeof imageField !== 'string') {
    return [];
  }

  const raw = imageField.trim();
  if (!raw) {
    return [];
  }

  if (!raw.startsWith('[')) {
    return [raw];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [raw];
    }

    return parsed
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .slice(0, 3);
  } catch {
    return [raw];
  }
}

function normalizeImageUrlsInput(
  imageUrls: string[] | null | undefined,
  imageUrl: string | null | undefined,
): string[] | null | undefined {
  if (imageUrls !== undefined) {
    if (imageUrls === null) {
      return null;
    }
    return imageUrls.slice(0, 3);
  }

  if (imageUrl !== undefined) {
    if (imageUrl === null) {
      return null;
    }
    return [imageUrl];
  }

  return undefined;
}

function serializeMealImageUrls(imageUrls: string[] | null | undefined): string | null {
  if (!imageUrls || imageUrls.length === 0) {
    return null;
  }

  const normalized = imageUrls
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .slice(0, 3);

  if (normalized.length === 0) {
    return null;
  }

  return normalized.length === 1 ? normalized[0] : JSON.stringify(normalized);
}

function mapMealRecord(
  row: Record<string, unknown>,
  foodRows: Record<string, unknown>[],
): MealRecord {
  const imageUrls = parseMealImageUrls(row.image_url);

  const foods: FoodItem[] = foodRows.map((foodRow) => ({
    id: foodRow.id as string,
    mealRecordId: foodRow.meal_record_id as string,
    name: foodRow.name as string,
    calories: Number(foodRow.calories),
    protein: Number(foodRow.protein ?? 0),
    fat: Number(foodRow.fat ?? 0),
    carbs: Number(foodRow.carbs ?? 0),
    serving: Number(foodRow.serving ?? 1),
    unit: (foodRow.unit as string) ?? 'g',
    createdAt: parseDatabaseTimestamp(foodRow.created_at),
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
    imageUrls,
    imageUrl: imageUrls[0] ?? null,
    recordedAt: parseDatabaseTimestamp(row.recorded_at),
    createdAt: parseDatabaseTimestamp(row.created_at),
    updatedAt: parseDatabaseTimestamp(row.updated_at),
  };
}

export async function createMealRecord(input: unknown): Promise<ActionResult<MealRecord>> {
  const parsed = createMealRecordSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { mealType, foods, imageUrls, imageUrl, recordedAt } = parsed.data;
  const normalizedImageUrls = normalizeImageUrlsInput(imageUrls, imageUrl);
  const totals = calculateMealTotals(foods);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { data: mealRow, error: mealError } = await supabase
      .from('meal_records')
      .insert({
        user_id: user.id,
        meal_type: mealType,
        total_calories: totals.calories,
        total_protein: totals.protein,
        total_fat: totals.fat,
        total_carbs: totals.carbs,
        image_url: serializeMealImageUrls(normalizedImageUrls),
        recorded_at: formatLocalTimestamp(recordedAt),
      })
      .select()
      .single();

    if (mealError || !mealRow) {
      return { success: false, error: '保存饮食记录失败，请重试' };
    }

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
      await supabase.from('meal_records').delete().eq('id', mealRow.id);
      return { success: false, error: '保存食物条目失败，请重试' };
    }

    return {
      success: true,
      data: mapMealRecord(mealRow, foodRows ?? []),
    };
  } catch {
    return { success: false, error: '服务异常，请稍后重试' };
  }
}

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

  const { mealType, foods, imageUrls, imageUrl } = parsed.data;
  const normalizedImageUrls = normalizeImageUrlsInput(imageUrls, imageUrl);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { data: existing } = await supabase
      .from('meal_records')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (!existing || existing.user_id !== user.id) {
      return { success: false, error: '记录不存在或无权限修改' };
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (mealType) {
      updatePayload.meal_type = mealType;
    }

    if (normalizedImageUrls !== undefined) {
      updatePayload.image_url = serializeMealImageUrls(normalizedImageUrls);
    }

    if (foods && foods.length > 0) {
      const totals = calculateMealTotals(foods);
      updatePayload.total_calories = totals.calories;
      updatePayload.total_protein = totals.protein;
      updatePayload.total_fat = totals.fat;
      updatePayload.total_carbs = totals.carbs;

      await supabase.from('food_items').delete().eq('meal_record_id', id);

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

    const { data: updatedRow, error: updateError } = await supabase
      .from('meal_records')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updatedRow) {
      return { success: false, error: '更新失败，请重试' };
    }

    const { data: foodRows } = await supabase
      .from('food_items')
      .select('*')
      .eq('meal_record_id', id)
      .order('created_at', { ascending: true });

    return {
      success: true,
      data: mapMealRecord(updatedRow, foodRows ?? []),
    };
  } catch {
    return { success: false, error: '服务异常，请稍后重试' };
  }
}

export async function deleteMealRecord(id: string): Promise<ActionResult> {
  if (!id) {
    return { success: false, error: '记录 ID 不能为空' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { data: deletedRows, error } = await supabase
      .from('meal_records')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id');

    if (error) {
      return { success: false, error: '删除失败，请重试' };
    }

    if (!deletedRows || deletedRows.length === 0) {
      return { success: false, error: '记录不存在或无权限删除' };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务异常，请稍后重试' };
  }
}

export async function getMealRecordsByDate(date: Date): Promise<ActionResult<MealRecord[]>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const { data: mealRows, error } = await supabase
      .from('meal_records')
      .select('*')
      .eq('user_id', user.id)
      .gte('recorded_at', formatLocalTimestamp(startOfDay))
      .lte('recorded_at', formatLocalTimestamp(endOfDay))
      .order('recorded_at', { ascending: true });

    if (error) {
      return { success: false, error: '查询失败，请重试' };
    }

    if (!mealRows || mealRows.length === 0) {
      return { success: true, data: [] };
    }

    const mealIds = mealRows.map((row) => row.id);
    const { data: allFoodRows } = await supabase
      .from('food_items')
      .select('*')
      .in('meal_record_id', mealIds);

    const foodsByMeal = new Map<string, Record<string, unknown>[]>();
    for (const foodRow of allFoodRows ?? []) {
      const mealId = foodRow.meal_record_id as string;
      if (!foodsByMeal.has(mealId)) {
        foodsByMeal.set(mealId, []);
      }
      foodsByMeal.get(mealId)!.push(foodRow);
    }

    const records = mealRows.map((row) => mapMealRecord(row, foodsByMeal.get(row.id) ?? []));
    return { success: true, data: records };
  } catch {
    return { success: false, error: '服务异常，请稍后重试' };
  }
}

export async function getMealRecordById(id: string): Promise<ActionResult<MealRecord>> {
  if (!id) {
    return { success: false, error: '记录 ID 不能为空' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { data: mealRow, error } = await supabase
      .from('meal_records')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !mealRow) {
      return { success: false, error: '记录不存在' };
    }

    if (mealRow.user_id !== user.id) {
      return { success: false, error: '无权访问该记录' };
    }

    const { data: foodRows } = await supabase
      .from('food_items')
      .select('*')
      .eq('meal_record_id', id)
      .order('created_at', { ascending: true });

    return {
      success: true,
      data: mapMealRecord(mealRow, foodRows ?? []),
    };
  } catch {
    return { success: false, error: '服务异常，请稍后重试' };
  }
}

export async function getDailyCalorieStats(
  startDate: Date,
  endDate: Date,
): Promise<ActionResult<DailyCalorieStat[]>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const { data: rows, error } = await supabase
      .from('meal_records')
      .select('recorded_at, total_calories')
      .eq('user_id', user.id)
      .gte('recorded_at', formatLocalTimestamp(start))
      .lte('recorded_at', formatLocalTimestamp(end));

    if (error) {
      return { success: false, error: '查询统计数据失败，请重试' };
    }

    const totals = new Map<string, number>();
    for (const row of rows ?? []) {
      const key = toLocalDateKey(parseDatabaseTimestamp(row.recorded_at));
      const current = totals.get(key) ?? 0;
      totals.set(key, current + Number(row.total_calories ?? 0));
    }

    const data: DailyCalorieStat[] = [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, calories]) => ({
        date: day,
        calories: Math.round(calories),
      }));

    return { success: true, data };
  } catch {
    return { success: false, error: '服务异常，请稍后重试' };
  }
}

'use server';

import { createClient } from '@/lib/supabase/server';
import { calculateDailyTotals } from '@/lib/utils/food-calorie';
import {
  buildNutritionAnalysis,
  buildHealthAdvice,
  detectConsecutiveOverTarget,
  countConsecutiveOverTargetDays,
  type DailyCalorieRecord,
} from '@/lib/utils/nutrition-analysis';
import type { NutritionAnalysis, HealthAdvice } from '@/types';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Analyze nutrition for a user on a given date.
 * Requirements: 7.1, 7.2, 7.3
 */
export async function analyzeNutrition(
  date: Date,
): Promise<ActionResult<NutritionAnalysis>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // Get user calorie target
    const { data: profile } = await supabase
      .from('users')
      .select('daily_calorie_target')
      .eq('id', user.id)
      .single();

    const targetCalories = Number(profile?.daily_calorie_target) || 2000;

    // Get meal records for the date
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const { data: mealRows } = await supabase
      .from('meal_records')
      .select('total_calories, total_protein, total_fat, total_carbs')
      .eq('user_id', user.id)
      .gte('recorded_at', startOfDay.toISOString())
      .lte('recorded_at', endOfDay.toISOString());

    const meals = (mealRows ?? []).map((r) => ({
      calories: Number(r.total_calories),
      protein: Number(r.total_protein ?? 0),
      fat: Number(r.total_fat ?? 0),
      carbs: Number(r.total_carbs ?? 0),
    }));

    const dailyTotals = calculateDailyTotals(meals);
    const intake = {
      totalCalories: dailyTotals.calories,
      totalProtein: dailyTotals.protein,
      totalFat: dailyTotals.fat,
      totalCarbs: dailyTotals.carbs,
    };

    const analysis = buildNutritionAnalysis(intake, targetCalories);
    return { success: true, data: analysis };
  } catch {
    return { success: false, error: '分析失败，请重试' };
  }
}


/**
 * Generate personalized health advice for a user.
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */
export async function generateHealthAdvice(
  date?: Date,
): Promise<
  ActionResult<{
    advice: HealthAdvice;
    consecutiveOverDays: number;
    shouldNotify: boolean;
  }>
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const targetDate = date ?? new Date();

    // Get user calorie target
    const { data: profile } = await supabase
      .from('users')
      .select('daily_calorie_target')
      .eq('id', user.id)
      .single();

    const targetCalories = Number(profile?.daily_calorie_target) || 2000;

    // Get meal records for the target date
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const { data: mealRows } = await supabase
      .from('meal_records')
      .select('total_calories, total_protein, total_fat, total_carbs')
      .eq('user_id', user.id)
      .gte('recorded_at', startOfDay.toISOString())
      .lte('recorded_at', endOfDay.toISOString());

    const meals = (mealRows ?? []).map((r) => ({
      calories: Number(r.total_calories),
      protein: Number(r.total_protein ?? 0),
      fat: Number(r.total_fat ?? 0),
      carbs: Number(r.total_carbs ?? 0),
    }));

    const dailyTotals = calculateDailyTotals(meals);
    const intake = {
      totalCalories: dailyTotals.calories,
      totalProtein: dailyTotals.protein,
      totalFat: dailyTotals.fat,
      totalCarbs: dailyTotals.carbs,
    };

    const advice = buildHealthAdvice(intake, targetCalories, targetDate);

    // Check consecutive over-target days (last 7 days)
    const sevenDaysAgo = new Date(targetDate);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const { data: recentRows } = await supabase
      .from('meal_records')
      .select('recorded_at, total_calories')
      .eq('user_id', user.id)
      .gte('recorded_at', sevenDaysAgo.toISOString())
      .lte('recorded_at', endOfDay.toISOString())
      .order('recorded_at', { ascending: true });

    // Aggregate by date
    const dailyMap = new Map<string, number>();
    for (const row of recentRows ?? []) {
      const d = new Date(row.recorded_at as string).toISOString().slice(0, 10);
      dailyMap.set(d, (dailyMap.get(d) ?? 0) + Number(row.total_calories));
    }

    const recentRecords: DailyCalorieRecord[] = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, totalCal]) => ({
        date: d,
        totalCalories: totalCal,
        targetCalories,
      }));

    const consecutiveOverDays = countConsecutiveOverTargetDays(recentRecords);
    const shouldNotify = detectConsecutiveOverTarget(recentRecords);

    return {
      success: true,
      data: {
        advice,
        consecutiveOverDays,
        shouldNotify,
      },
    };
  } catch {
    return { success: false, error: '生成建议失败，请重试' };
  }
}

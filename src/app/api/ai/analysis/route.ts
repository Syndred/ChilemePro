/**
 * AI Analysis API Route
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 *
 * POST /api/ai/analysis
 * Body: { date?: string }
 * Returns: NutritionAnalysis + HealthAdvice + consecutive over-target info
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateDailyTotals } from '@/lib/utils/food-calorie';
import {
  buildNutritionAnalysis,
  buildHealthAdvice,
  detectConsecutiveOverTarget,
  countConsecutiveOverTargetDays,
  type DailyCalorieRecord,
} from '@/lib/utils/nutrition-analysis';
import { generateAIHealthAdvice } from '@/services/ai/healthAdviceService';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: '请先登录' },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const dateStr = body.date as string | undefined;
    const targetDate = dateStr ? new Date(dateStr) : new Date();

    // Get user profile for calorie target
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('daily_calorie_target, nickname')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: '获取用户信息失败' },
        { status: 500 },
      );
    }

    const targetCalories = Number(profile.daily_calorie_target) || 2000;
    const nickname = (profile.nickname as string) || '用户';

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

    // Build analysis
    const analysis = buildNutritionAnalysis(intake, targetCalories);
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
      .map(([date, totalCalories]) => ({
        date,
        totalCalories,
        targetCalories,
      }));

    const consecutiveOverDays = countConsecutiveOverTargetDays(recentRecords);
    const shouldNotify = detectConsecutiveOverTarget(recentRecords);

    // Optionally enhance with AI-generated advice
    let aiAdvice = {
      mealSuggestions: advice.mealSuggestions,
      exerciseSuggestions: advice.exerciseSuggestions,
      nutritionTips: advice.nutritionTips,
    };

    if (process.env.OPENAI_API_KEY) {
      aiAdvice = await generateAIHealthAdvice({ analysis, nickname });
    }

    return NextResponse.json({
      analysis,
      advice: {
        ...advice,
        mealSuggestions: aiAdvice.mealSuggestions,
        exerciseSuggestions: aiAdvice.exerciseSuggestions,
        nutritionTips: aiAdvice.nutritionTips,
      },
      consecutiveOverDays,
      shouldNotify,
    });
  } catch {
    return NextResponse.json(
      { error: '分析失败，请重试' },
      { status: 500 },
    );
  }
}

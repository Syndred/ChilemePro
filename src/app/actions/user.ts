'use server';

import { createClient } from '@/lib/supabase/server';
import { onboardingSchema } from '@/lib/validations/onboarding';
import type { Gender, ActivityLevel } from '@/types';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

interface SaveProfileInput {
  height: number;
  weight: number;
  targetWeight: number;
  age: number;
  gender: Gender;
  activityLevel: ActivityLevel;
  dailyCalorieTarget: number;
}

/**
 * Save user profile during onboarding.
 * Requirement 1.5: Guide new users to complete basic info setup
 * Requirement 2.1: Collect height, weight, target weight, age, gender, activity level
 * Requirement 2.2: Calculate daily recommended calories via Harris-Benedict formula
 */
export async function saveUserProfile(
  input: SaveProfileInput,
): Promise<ActionResult> {
  // Validate the body fields (excluding dailyCalorieTarget which is computed)
  const parsed = onboardingSchema.safeParse({
    height: input.height,
    weight: input.weight,
    targetWeight: input.targetWeight,
    age: input.age,
    gender: input.gender,
    activityLevel: input.activityLevel,
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { error } = await supabase
      .from('users')
      .update({
        height: input.height,
        weight: input.weight,
        target_weight: input.targetWeight,
        age: input.age,
        gender: input.gender,
        activity_level: input.activityLevel,
        daily_calorie_target: input.dailyCalorieTarget,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) {
      return { success: false, error: '保存失败，请重试' };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Get the current user's profile data.
 * Used by the home page to display calorie target.
 */
export async function getUserProfile(): Promise<
  ActionResult<{
    dailyCalorieTarget: number;
    nickname: string;
  }>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { data, error } = await supabase
      .from('users')
      .select('daily_calorie_target, nickname')
      .eq('id', user.id)
      .single();

    if (error || !data) {
      return { success: false, error: '获取用户信息失败' };
    }

    return {
      success: true,
      data: {
        dailyCalorieTarget: Number(data.daily_calorie_target) || 2000,
        nickname: (data.nickname as string) || '用户',
      },
    };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

'use server';

import { createClient } from '@/lib/supabase/server';
import { calculateDailyCalories } from '@/lib/utils/calorie';
import {
  validateEditProfile,
  calculateCheckInStats,
  type ProfileSummary,
  type EditProfileInput,
  type CheckInStats,
} from '@/lib/utils/profile';
import type { Gender, ActivityLevel } from '@/types';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Get the full profile summary for the current user.
 * Requirement 16.1: Personal info
 * Requirement 16.2: Check-in statistics
 * Requirement 16.3: Reward balance and withdrawal history
 * Requirement 16.4: Membership info
 */
export async function getProfileSummary(): Promise<ActionResult<ProfileSummary>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // Fetch user profile
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return { success: false, error: '获取用户信息失败' };
    }

    // Fetch check-in stats: get distinct dates with meal records
    const { data: mealDates } = await supabase
      .from('meal_records')
      .select('recorded_at')
      .eq('user_id', user.id);

    const recordDates = (mealDates ?? []).map((m) => {
      const d = new Date(m.recorded_at as string);
      return d.toISOString().split('T')[0];
    });

    const totalMealRecords = mealDates?.length ?? 0;
    const checkInStats = calculateCheckInStats(recordDates, totalMealRecords);

    // Fetch reward balance
    const { data: latestTx } = await supabase
      .from('reward_transactions')
      .select('balance_after')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const rewardBalance = Number(latestTx?.balance_after ?? 0);

    const summary: ProfileSummary = {
      nickname: (userData.nickname as string) || '用户',
      avatar: (userData.avatar as string) || '',
      height: Number(userData.height) || 0,
      weight: Number(userData.weight) || 0,
      targetWeight: Number(userData.target_weight) || 0,
      age: Number(userData.age) || 0,
      gender: (userData.gender as Gender) || 'other',
      activityLevel: (userData.activity_level as ActivityLevel) || 'moderate',
      dailyCalorieTarget: Number(userData.daily_calorie_target) || 2000,
      membershipTier: (userData.membership_tier as string) || 'free',
      membershipExpiresAt: userData.membership_expires_at
        ? new Date(userData.membership_expires_at as string)
        : null,
      rewardBalance,
      checkInStats,
    };

    return { success: true, data: summary };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}


/**
 * Update the current user's profile.
 * Requirement 16.1: Edit personal info (nickname, avatar, basic info)
 * Requirement 2.2: Recalculate daily calories when info changes
 * Requirement 2.3: Recalculate on modification
 */
export async function updateProfile(
  input: EditProfileInput,
): Promise<ActionResult> {
  // Validate input using pure function
  const validation = validateEditProfile(input);
  if (!validation.valid) {
    const firstError = Object.values(validation.errors)[0];
    return { success: false, error: firstError };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // Recalculate daily calorie target
    const dailyCalorieTarget = calculateDailyCalories({
      gender: input.gender,
      weight: input.weight,
      height: input.height,
      age: input.age,
      activityLevel: input.activityLevel,
    });

    const updateData: Record<string, unknown> = {
      nickname: input.nickname.trim(),
      height: input.height,
      weight: input.weight,
      target_weight: input.targetWeight,
      age: input.age,
      gender: input.gender,
      activity_level: input.activityLevel,
      daily_calorie_target: dailyCalorieTarget,
      updated_at: new Date().toISOString(),
    };

    if (input.avatar) {
      updateData.avatar = input.avatar;
    }

    const { error } = await supabase
      .from('users')
      .update(updateData)
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
 * Get the current user's check-in statistics.
 * Requirement 16.2: Display check-in statistics
 */
export async function getCheckInStats(): Promise<ActionResult<CheckInStats>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { data: mealDates } = await supabase
      .from('meal_records')
      .select('recorded_at')
      .eq('user_id', user.id);

    const recordDates = (mealDates ?? []).map((m) => {
      const d = new Date(m.recorded_at as string);
      return d.toISOString().split('T')[0];
    });

    const totalMealRecords = mealDates?.length ?? 0;
    const stats = calculateCheckInStats(recordDates, totalMealRecords);

    return { success: true, data: stats };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

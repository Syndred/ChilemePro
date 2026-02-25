'use server';

import { createClient } from '@/lib/supabase/server';
import {
  getEffectiveMembershipStatus,
  checkAiPhotoUsage,
} from '@/lib/utils/membership';
import type { MembershipTier, MembershipStatus, AiPhotoUsageResult } from '@/lib/utils/membership';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Get the current user's membership status.
 * Requirement 22.6: Display membership benefits comparison page.
 */
export async function getMembershipStatus(): Promise<ActionResult<MembershipStatus>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { data, error } = await supabase
      .from('users')
      .select('membership_tier, membership_expires_at')
      .eq('id', user.id)
      .single();

    if (error || !data) {
      return { success: false, error: '获取会员信息失败' };
    }

    const tier = (data.membership_tier as MembershipTier) || 'free';
    const expiresAt = data.membership_expires_at
      ? new Date(data.membership_expires_at as string)
      : null;

    const status = getEffectiveMembershipStatus(tier, expiresAt);

    return { success: true, data: status };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Check if the current user can use AI photo recognition.
 * Requirement 22.3: Free users limited to 3 AI photo uses per day.
 * Requirement 22.4: Prompt upgrade when exceeding limit.
 */
export async function checkAiPhotoAccess(): Promise<ActionResult<AiPhotoUsageResult>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // Get user membership info
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('membership_tier, membership_expires_at')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return { success: false, error: '获取用户信息失败' };
    }

    const tier = (userData.membership_tier as MembershipTier) || 'free';
    const expiresAt = userData.membership_expires_at
      ? new Date(userData.membership_expires_at as string)
      : null;

    // Count today's AI photo usage from meal_records with image_url
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const { count, error: countError } = await supabase
      .from('meal_records')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('image_url', 'is', null)
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString());

    if (countError) {
      return { success: false, error: '查询使用次数失败' };
    }

    const dailyUsageCount = count ?? 0;
    const result = checkAiPhotoUsage(tier, expiresAt, dailyUsageCount);

    return { success: true, data: result };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

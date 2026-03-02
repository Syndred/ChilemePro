'use server';

import { createClient } from '@/lib/supabase/server';
import { getEffectiveMembershipStatus, checkAiPhotoUsage } from '@/lib/utils/membership';
import type {
  MembershipTier,
  MembershipStatus,
  AiPhotoUsageResult,
} from '@/lib/utils/membership';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function getMembershipStatus(): Promise<ActionResult<MembershipStatus>> {
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

    return { success: true, data: getEffectiveMembershipStatus(tier, expiresAt) };
  } catch {
    return { success: false, error: '服务器错误，请稍后重试' };
  }
}

async function getDailyAiUsageCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  today: string,
): Promise<number> {
  const { data: usageRow, error: usageError } = await supabase
    .from('ai_usage_logs')
    .select('usage_count')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .maybeSingle();

  if (!usageError && usageRow) {
    return Number(usageRow.usage_count ?? 0);
  }

  // Fallback for environments where migration not yet applied.
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const { count } = await supabase
    .from('meal_records')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('image_url', 'is', null)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString());

  return count ?? 0;
}

export async function checkAiPhotoAccess(): Promise<ActionResult<AiPhotoUsageResult>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

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
    const today = new Date().toISOString().split('T')[0];
    const dailyUsageCount = await getDailyAiUsageCount(supabase, user.id, today);

    return {
      success: true,
      data: checkAiPhotoUsage(tier, expiresAt, dailyUsageCount),
    };
  } catch {
    return { success: false, error: '服务器错误，请稍后重试' };
  }
}

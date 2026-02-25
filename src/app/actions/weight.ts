'use server';

import { createClient } from '@/lib/supabase/server';
import type { WeightRecord } from '@/types';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

function mapWeightRecord(row: Record<string, unknown>): WeightRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    weight: Number(row.weight),
    recordedAt: new Date(row.recorded_at as string),
    createdAt: new Date(row.created_at as string),
  };
}

/**
 * Create or update a weight record for a specific date.
 * Uses upsert since there's a unique constraint on (user_id, recorded_at).
 * Requirement 8.5: Support recording daily weight
 */
export async function saveWeightRecord(
  weight: number,
  date: Date,
): Promise<ActionResult<WeightRecord>> {
  if (weight < 30 || weight > 300) {
    return { success: false, error: '体重范围应在 30-300 公斤之间' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const dateStr = date.toISOString().split('T')[0];

    const { data: row, error } = await supabase
      .from('weight_records')
      .upsert(
        {
          user_id: user.id,
          weight,
          recorded_at: dateStr,
        },
        { onConflict: 'user_id,recorded_at' },
      )
      .select()
      .single();

    if (error || !row) {
      return { success: false, error: '保存体重记录失败，请重试' };
    }

    return { success: true, data: mapWeightRecord(row) };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Get weight records for a user within a date range.
 * Requirement 8.3: Provide weight change curve
 * Requirement 8.6: Calculate and display weight change trend
 */
export async function getWeightRecords(
  startDate: Date,
  endDate: Date,
): Promise<ActionResult<WeightRecord[]>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const { data: rows, error } = await supabase
      .from('weight_records')
      .select('*')
      .eq('user_id', user.id)
      .gte('recorded_at', startStr)
      .lte('recorded_at', endStr)
      .order('recorded_at', { ascending: true });

    if (error) {
      return { success: false, error: '查询体重记录失败，请重试' };
    }

    return {
      success: true,
      data: (rows ?? []).map(mapWeightRecord),
    };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

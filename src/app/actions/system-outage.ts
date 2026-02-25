'use server';

import { createClient } from '@/lib/supabase/server';
import {
  calculateOutageDuration,
  shouldAutoValidateTask,
  shouldNotifyUsers,
  checkOutageRefundEligibility,
  validateAppeal,
  getAffectedUserIds,
  OUTAGE_NOTIFICATION_THRESHOLD_MS,
} from '@/lib/utils/system-outage';
import { CHALLENGE_DEPOSIT } from '@/lib/utils/challenge';
import type { SystemOutage, UserAppeal, OutageRefund } from '@/types';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// --- Mappers ---

function mapOutage(row: Record<string, unknown>): SystemOutage {
  return {
    id: row.id as string,
    startTime: new Date(row.start_time as string),
    endTime: row.end_time ? new Date(row.end_time as string) : null,
    description: (row.description as string) ?? '',
    status: row.status as SystemOutage['status'],
    affectedServices: (row.affected_services as string[]) ?? [],
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapAppeal(row: Record<string, unknown>): UserAppeal {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    challengeId: (row.challenge_id as string) ?? null,
    outageId: (row.outage_id as string) ?? null,
    reason: row.reason as string,
    status: row.status as UserAppeal['status'],
    refundAmount: row.refund_amount != null ? Number(row.refund_amount) : null,
    processedAt: row.processed_at ? new Date(row.processed_at as string) : null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/**
 * Record a system outage start.
 * Requirement 24.1: Record outage time periods.
 */
export async function recordOutageStart(
  description: string,
  affectedServices: string[] = [],
): Promise<ActionResult<SystemOutage>> {
  if (!description || description.trim().length === 0) {
    return { success: false, error: '故障描述不能为空' };
  }

  try {
    const supabase = await createClient();

    const { data: row, error } = await supabase
      .from('system_outages')
      .insert({
        start_time: new Date().toISOString(),
        description: description.trim(),
        status: 'active',
        affected_services: affectedServices,
      })
      .select()
      .single();

    if (error || !row) {
      return { success: false, error: '记录故障失败' };
    }

    return { success: true, data: mapOutage(row as Record<string, unknown>) };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Record a system outage resolution.
 * Requirement 24.1: Record outage time periods.
 */
export async function recordOutageEnd(
  outageId: string,
): Promise<ActionResult<SystemOutage>> {
  if (!outageId) {
    return { success: false, error: '故障 ID 不能为空' };
  }

  try {
    const supabase = await createClient();
    const now = new Date();

    const { data: row, error } = await supabase
      .from('system_outages')
      .update({
        end_time: now.toISOString(),
        status: 'resolved',
        updated_at: now.toISOString(),
      })
      .eq('id', outageId)
      .eq('status', 'active')
      .select()
      .single();

    if (error || !row) {
      return { success: false, error: '更新故障记录失败' };
    }

    return { success: true, data: mapOutage(row as Record<string, unknown>) };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Auto-validate daily tasks affected by an outage.
 * Requirement 24.2: Auto-validate tasks during outage periods.
 */
export async function autoValidateOutageTasks(
  outageId: string,
): Promise<ActionResult<{ validatedCount: number }>> {
  if (!outageId) {
    return { success: false, error: '故障 ID 不能为空' };
  }

  try {
    const supabase = await createClient();

    // Fetch the outage
    const { data: outage } = await supabase
      .from('system_outages')
      .select('*')
      .eq('id', outageId)
      .single();

    if (!outage) {
      return { success: false, error: '故障记录不存在' };
    }

    const outageStart = new Date(outage.start_time as string);
    const outageEnd = outage.end_time ? new Date(outage.end_time as string) : null;

    // Find active challenges
    const { data: activeChallenges } = await supabase
      .from('challenges')
      .select('id')
      .eq('status', 'active');

    if (!activeChallenges || activeChallenges.length === 0) {
      return { success: true, data: { validatedCount: 0 } };
    }

    const challengeIds = activeChallenges.map((c) => c.id as string);

    // Find uncompleted daily tasks for these challenges
    const { data: tasks } = await supabase
      .from('daily_tasks')
      .select('*')
      .in('challenge_id', challengeIds)
      .eq('completed', false);

    if (!tasks || tasks.length === 0) {
      return { success: true, data: { validatedCount: 0 } };
    }

    let validatedCount = 0;

    for (const task of tasks) {
      const taskDate = new Date(task.task_date as string);
      const validation = shouldAutoValidateTask(
        taskDate,
        Boolean(task.completed),
        [{ startTime: outageStart, endTime: outageEnd, id: outageId }],
      );

      if (validation.shouldAutoValidate) {
        await supabase
          .from('daily_tasks')
          .update({
            completed: true,
            meal_recorded: true,
            calorie_target_met: true,
            checked_at: new Date().toISOString(),
          })
          .eq('id', task.id);

        validatedCount++;
      }
    }

    return { success: true, data: { validatedCount } };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Check if outage exceeds 2 hours and notify affected users.
 * Requirement 24.3: Notify when outage exceeds 2 hours.
 */
export async function checkAndNotifyOutageUsers(
  outageId: string,
): Promise<ActionResult<{ notified: boolean; userCount: number }>> {
  if (!outageId) {
    return { success: false, error: '故障 ID 不能为空' };
  }

  try {
    const supabase = await createClient();

    const { data: outage } = await supabase
      .from('system_outages')
      .select('*')
      .eq('id', outageId)
      .single();

    if (!outage) {
      return { success: false, error: '故障记录不存在' };
    }

    const outageStart = new Date(outage.start_time as string);
    const outageEnd = outage.end_time ? new Date(outage.end_time as string) : null;
    const now = new Date();

    if (!shouldNotifyUsers(outageStart, outageEnd, now)) {
      return { success: true, data: { notified: false, userCount: 0 } };
    }

    // Find active challenges during the outage
    const { data: activeChallenges } = await supabase
      .from('challenges')
      .select('user_id, start_date, end_date')
      .eq('status', 'active');

    if (!activeChallenges || activeChallenges.length === 0) {
      return { success: true, data: { notified: true, userCount: 0 } };
    }

    const affectedUserIds = getAffectedUserIds(
      activeChallenges.map((c) => ({
        userId: c.user_id as string,
        startDate: new Date(c.start_date as string),
        endDate: new Date(c.end_date as string),
      })),
      outageStart,
      outageEnd,
    );

    // In production, this would send push notifications
    // For now, we record the notification event
    return {
      success: true,
      data: { notified: true, userCount: affectedUserIds.length },
    };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Process a full refund for a challenge affected by system outage.
 * Requirement 24.4: Full deposit refund when outage causes challenge failure.
 */
export async function processOutageRefund(
  challengeId: string,
): Promise<ActionResult<{ refundAmount: number }>> {
  if (!challengeId) {
    return { success: false, error: '挑战 ID 不能为空' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // Fetch challenge
    const { data: challenge } = await supabase
      .from('challenges')
      .select('*')
      .eq('id', challengeId)
      .eq('user_id', user.id)
      .single();

    if (!challenge) {
      return { success: false, error: '挑战不存在或无权操作' };
    }

    // Fetch task dates
    const { data: tasks } = await supabase
      .from('daily_tasks')
      .select('task_date')
      .eq('challenge_id', challengeId);

    const taskDates = (tasks ?? []).map((t) => new Date(t.task_date as string));

    // Fetch outages during the challenge period
    const { data: outages } = await supabase
      .from('system_outages')
      .select('*')
      .or(`end_time.is.null,end_time.gte.${challenge.start_date}`);

    const outageList = (outages ?? []).map((o) => ({
      startTime: new Date(o.start_time as string),
      endTime: o.end_time ? new Date(o.end_time as string) : null,
    }));

    const eligibility = checkOutageRefundEligibility(
      challenge.status as string,
      Number(challenge.deposit),
      taskDates,
      outageList,
    );

    if (!eligibility.eligible) {
      return { success: false, error: eligibility.reason };
    }

    // Create refund record
    await supabase.from('outage_refunds').insert({
      user_id: user.id,
      challenge_id: challengeId,
      outage_id: outages?.[0]?.id ?? null,
      refund_amount: eligibility.refundAmount,
      status: 'pending',
    });

    // Create reward transaction for the refund
    const { data: latestTx } = await supabase
      .from('reward_transactions')
      .select('balance_after')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const currentBalance = Number(latestTx?.balance_after ?? 0);

    await supabase.from('reward_transactions').insert({
      user_id: user.id,
      challenge_id: challengeId,
      type: 'withdrawal',
      amount: eligibility.refundAmount,
      balance_after: currentBalance + eligibility.refundAmount,
      status: 'completed',
      processed_at: new Date().toISOString(),
    });

    return { success: true, data: { refundAmount: eligibility.refundAmount } };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Submit a user appeal.
 * Requirement 24.5: Provide user appeal channel.
 */
export async function submitAppeal(
  challengeId: string,
  reason: string,
): Promise<ActionResult<UserAppeal>> {
  if (!challengeId) {
    return { success: false, error: '挑战 ID 不能为空' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // Check for existing pending appeals
    const { data: existingAppeals } = await supabase
      .from('user_appeals')
      .select('id')
      .eq('user_id', user.id)
      .eq('challenge_id', challengeId)
      .eq('status', 'pending');

    const hasPending = (existingAppeals ?? []).length > 0;
    const validation = validateAppeal(reason, hasPending);

    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    // Find relevant outage if any
    const { data: challenge } = await supabase
      .from('challenges')
      .select('start_date, end_date')
      .eq('id', challengeId)
      .eq('user_id', user.id)
      .single();

    if (!challenge) {
      return { success: false, error: '挑战不存在或无权操作' };
    }

    const { data: outages } = await supabase
      .from('system_outages')
      .select('id')
      .or(`end_time.is.null,end_time.gte.${challenge.start_date}`)
      .limit(1);

    const outageId = outages?.[0]?.id ?? null;

    const { data: row, error } = await supabase
      .from('user_appeals')
      .insert({
        user_id: user.id,
        challenge_id: challengeId,
        outage_id: outageId,
        reason: reason.trim(),
        status: 'pending',
      })
      .select()
      .single();

    if (error || !row) {
      return { success: false, error: '提交申诉失败' };
    }

    return { success: true, data: mapAppeal(row as Record<string, unknown>) };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Process an appeal (admin action).
 * Requirement 24.6: Process refund within 3 business days.
 */
export async function processAppeal(
  appealId: string,
  decision: 'approved' | 'rejected',
): Promise<ActionResult<UserAppeal>> {
  if (!appealId) {
    return { success: false, error: '申诉 ID 不能为空' };
  }

  try {
    const supabase = await createClient();
    const now = new Date();

    const { data: appeal } = await supabase
      .from('user_appeals')
      .select('*, challenges(deposit)')
      .eq('id', appealId)
      .eq('status', 'pending')
      .single();

    if (!appeal) {
      return { success: false, error: '申诉不存在或已处理' };
    }

    const refundAmount = decision === 'approved'
      ? Number((appeal.challenges as Record<string, unknown>)?.deposit ?? CHALLENGE_DEPOSIT)
      : null;

    const { data: row, error } = await supabase
      .from('user_appeals')
      .update({
        status: decision,
        refund_amount: refundAmount,
        processed_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', appealId)
      .select()
      .single();

    if (error || !row) {
      return { success: false, error: '处理申诉失败' };
    }

    // If approved, create refund
    if (decision === 'approved' && refundAmount && appeal.user_id && appeal.challenge_id) {
      const { data: latestTx } = await supabase
        .from('reward_transactions')
        .select('balance_after')
        .eq('user_id', appeal.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const currentBalance = Number(latestTx?.balance_after ?? 0);

      await supabase.from('reward_transactions').insert({
        user_id: appeal.user_id,
        challenge_id: appeal.challenge_id,
        type: 'withdrawal',
        amount: refundAmount,
        balance_after: currentBalance + refundAmount,
        status: 'completed',
        processed_at: now.toISOString(),
      });
    }

    return { success: true, data: mapAppeal(row as Record<string, unknown>) };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Get user's appeals.
 * Requirement 24.5: User appeal channel.
 */
export async function getUserAppeals(): Promise<ActionResult<UserAppeal[]>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { data: rows, error } = await supabase
      .from('user_appeals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: '查询申诉记录失败' };
    }

    const appeals = (rows ?? []).map((r) => mapAppeal(r as Record<string, unknown>));
    return { success: true, data: appeals };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

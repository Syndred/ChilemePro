'use server';

import { createClient } from '@/lib/supabase/server';
import {
  checkImageHashDuplicate,
  detectBatchAddPattern,
  detectTimeAnomaly,
  shouldBanAccount,
  checkIdentityConsistency,
  validateChallengeEligibility,
  type MealRecordTimestamp,
} from '@/lib/utils/anti-cheat';
import type { AntiCheatSeverity } from '@/types';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Log a suspicious behavior entry to the anti_cheat_logs table.
 * Requirement 21.9: Log all suspicious behavior for audit.
 */
export async function logSuspiciousBehavior(
  userId: string,
  actionType: string,
  suspiciousReason: string,
  severity: AntiCheatSeverity,
  deviceId?: string,
  ipAddress?: string,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { error } = await supabase.from('anti_cheat_logs').insert({
      user_id: userId,
      device_id: deviceId ?? null,
      ip_address: ipAddress ?? null,
      action_type: actionType,
      suspicious_reason: suspiciousReason,
      severity,
      status: 'pending',
    });

    if (error) {
      return { success: false, error: '记录可疑行为失败' };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误' };
  }
}

/**
 * Validate that a user is eligible to join a challenge (uniqueness checks).
 * Requirement 21.1, 21.2, 21.3: Device, phone, payment account uniqueness.
 */
export async function validateChallengeAntiCheat(
  userId: string,
  deviceId: string,
): Promise<ActionResult<{ eligible: boolean; reasons: string[] }>> {
  try {
    const supabase = await createClient();

    // Get user's phone
    const { data: userData } = await supabase
      .from('users')
      .select('phone')
      .eq('id', userId)
      .single();

    if (!userData?.phone) {
      return { success: false, error: '用户信息不完整' };
    }

    // Get active challenges with their user info
    const { data: activeChallenges } = await supabase
      .from('challenges')
      .select('user_id')
      .in('status', ['active', 'pending']);

    const activeUserIds = (activeChallenges ?? []).map(
      (c) => c.user_id as string,
    );

    // Get device IDs, phones, and payment accounts of active challenge users
    const { data: activeUsers } = activeUserIds.length > 0
      ? await supabase
          .from('users')
          .select('id, phone')
          .in('id', activeUserIds)
          .neq('id', userId)
      : { data: [] };

    const activePhones = (activeUsers ?? [])
      .map((u) => u.phone as string)
      .filter(Boolean);

    // Get device IDs from anti_cheat_logs for active challenge users
    const { data: deviceLogs } = activeUserIds.length > 0
      ? await supabase
          .from('anti_cheat_logs')
          .select('device_id')
          .in('user_id', activeUserIds.filter((id) => id !== userId))
          .eq('action_type', 'challenge_join')
          .not('device_id', 'is', null)
      : { data: [] };

    const activeDeviceIds = (deviceLogs ?? [])
      .map((l) => l.device_id as string)
      .filter(Boolean);

    // Get payment accounts from payment_transactions for active challenge users
    const { data: paymentLogs } = activeUserIds.length > 0
      ? await supabase
          .from('payment_transactions')
          .select('transaction_id, user_id')
          .in('user_id', activeUserIds.filter((id) => id !== userId))
          .eq('type', 'deposit')
          .eq('status', 'completed')
      : { data: [] };

    const activePaymentAccounts = (paymentLogs ?? [])
      .map((p) => p.transaction_id as string)
      .filter(Boolean);

    const result = validateChallengeEligibility({
      deviceId,
      phone: userData.phone as string,
      paymentAccount: '', // Payment account checked at payment time
      activeDeviceIds,
      activePhones,
      activePaymentAccounts,
    });

    // Log violations if any
    for (const violation of result.violations) {
      await logSuspiciousBehavior(
        userId,
        violation.actionType,
        violation.suspiciousReason,
        violation.severity,
        deviceId,
      );
    }

    return {
      success: true,
      data: { eligible: result.eligible, reasons: result.reasons },
    };
  } catch {
    return { success: false, error: '服务器错误' };
  }
}

/**
 * Check if an uploaded image is a duplicate for a user.
 * Requirement 21.4: Detect duplicate uploaded photos.
 */
export async function checkImageDuplicate(
  userId: string,
  imageHash: string,
): Promise<ActionResult<{ isDuplicate: boolean }>> {
  try {
    const supabase = await createClient();

    // Get existing image hashes from meal records
    // We store image hashes in anti_cheat_logs with action_type 'image_upload'
    const { data: existingLogs } = await supabase
      .from('anti_cheat_logs')
      .select('suspicious_reason')
      .eq('user_id', userId)
      .eq('action_type', 'image_upload');

    const existingHashes = (existingLogs ?? [])
      .map((l) => l.suspicious_reason as string)
      .filter(Boolean);

    const result = checkImageHashDuplicate({
      imageHash,
      existingHashes,
    });

    if (result.isDuplicate) {
      await logSuspiciousBehavior(
        userId,
        'duplicate_image',
        result.reason ?? '重复图片',
        'high',
      );
    } else {
      // Record the hash for future checks
      await supabase.from('anti_cheat_logs').insert({
        user_id: userId,
        action_type: 'image_upload',
        suspicious_reason: imageHash,
        severity: 'low',
        status: 'dismissed',
      });
    }

    return { success: true, data: { isDuplicate: result.isDuplicate } };
  } catch {
    return { success: false, error: '服务器错误' };
  }
}

/**
 * Detect abnormal meal recording patterns for a user.
 * Requirement 21.5: Detect abnormal record patterns.
 */
export async function detectAbnormalPatterns(
  userId: string,
): Promise<ActionResult<{ isSuspicious: boolean; reasons: string[] }>> {
  try {
    const supabase = await createClient();

    // Get recent meal records (last 24 hours)
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    const { data: recentRecords } = await supabase
      .from('meal_records')
      .select('created_at')
      .eq('user_id', userId)
      .gte('created_at', oneDayAgo.toISOString())
      .order('created_at', { ascending: true });

    const timestamps: MealRecordTimestamp[] = (recentRecords ?? []).map(
      (r) => ({ recordedAt: new Date(r.created_at as string) }),
    );

    const reasons: string[] = [];

    const batchResult = detectBatchAddPattern(timestamps);
    if (batchResult.isSuspicious) {
      reasons.push(batchResult.reason!);
      await logSuspiciousBehavior(
        userId,
        'batch_add',
        batchResult.reason!,
        batchResult.severity,
      );
    }

    const timeResult = detectTimeAnomaly(timestamps);
    if (timeResult.isSuspicious) {
      reasons.push(timeResult.reason!);
      await logSuspiciousBehavior(
        userId,
        'time_anomaly',
        timeResult.reason!,
        timeResult.severity,
      );
    }

    return {
      success: true,
      data: { isSuspicious: reasons.length > 0, reasons },
    };
  } catch {
    return { success: false, error: '服务器错误' };
  }
}

/**
 * Check if a user's account should be banned.
 * Requirement 21.7: Cheating account → ban and no cashback.
 */
export async function checkAndBanAccount(
  userId: string,
): Promise<ActionResult<{ banned: boolean; reason?: string }>> {
  try {
    const supabase = await createClient();

    // Count high-severity confirmed violations
    const { count } = await supabase
      .from('anti_cheat_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('severity', 'high')
      .in('status', ['confirmed', 'pending']);

    const banResult = shouldBanAccount({
      highSeverityCount: count ?? 0,
      isBanned: false,
    });

    if (banResult.shouldBan) {
      // Ban the account: invalidate active challenges
      await supabase
        .from('challenges')
        .update({ status: 'failed' })
        .eq('user_id', userId)
        .in('status', ['active', 'pending']);

      // Log the ban
      await logSuspiciousBehavior(
        userId,
        'account_ban',
        banResult.reason ?? '账号封禁',
        'high',
      );
    }

    return {
      success: true,
      data: { banned: banResult.shouldBan, reason: banResult.reason },
    };
  } catch {
    return { success: false, error: '服务器错误' };
  }
}

/**
 * Verify payment and withdrawal identity consistency.
 * Requirement 21.8: Payment identity must match withdrawal identity.
 */
export async function verifyIdentityConsistency(
  userId: string,
  withdrawalAccount: string,
): Promise<ActionResult<{ isConsistent: boolean }>> {
  try {
    const supabase = await createClient();

    // Get the user's most recent deposit payment
    const { data: paymentRecord } = await supabase
      .from('payment_transactions')
      .select('transaction_id, payment_method')
      .eq('user_id', userId)
      .eq('type', 'deposit')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!paymentRecord) {
      return {
        success: true,
        data: { isConsistent: true }, // No deposit record, allow withdrawal
      };
    }

    const result = checkIdentityConsistency({
      paymentIdentity: paymentRecord.transaction_id as string,
      withdrawalIdentity: withdrawalAccount,
    });

    if (!result.isConsistent) {
      await logSuspiciousBehavior(
        userId,
        'identity_mismatch',
        result.reason ?? '身份不一致',
        'high',
      );
    }

    return { success: true, data: { isConsistent: result.isConsistent } };
  } catch {
    return { success: false, error: '服务器错误' };
  }
}

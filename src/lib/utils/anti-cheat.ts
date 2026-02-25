/**
 * Pure anti-cheat business logic — no side effects, fully testable.
 *
 * Requirement 21.1: Same device can only participate in one concurrent Challenge
 * Requirement 21.2: Same phone number can only participate in one concurrent Challenge
 * Requirement 21.3: Same payment account can only participate in one concurrent Challenge
 * Requirement 21.4: Detect duplicate uploaded photos → mark record invalid
 * Requirement 21.5: Detect abnormal record patterns (batch add, time anomaly) → flag for review
 * Requirement 21.6: Detect fake check-in → invalidate daily task
 * Requirement 21.7: Cheating account → ban and no cashback
 * Requirement 21.8: Payment identity must match withdrawal identity
 * Requirement 21.9: Log all suspicious behavior for audit
 */

import type { AntiCheatSeverity } from '@/types';

// --- Constants ---

/** Maximum number of meal records allowed within a short time window */
export const BATCH_ADD_THRESHOLD = 5;

/** Time window in minutes for batch add detection */
export const BATCH_ADD_WINDOW_MINUTES = 10;

/** Minimum interval in seconds between consecutive meal records */
export const MIN_RECORD_INTERVAL_SECONDS = 30;

/** Maximum number of high-severity violations before auto-ban */
export const AUTO_BAN_VIOLATION_THRESHOLD = 3;

// --- Types ---

export interface UniquenessCheckInput {
  /** The identifier to check (device ID, phone, or payment account) */
  identifier: string;
  /** Identifiers already participating in active challenges */
  activeIdentifiers: string[];
}

export interface UniquenessCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface ImageHashCheckInput {
  /** Hash of the image being uploaded */
  imageHash: string;
  /** Hashes of the user's existing meal record images */
  existingHashes: string[];
}

export interface ImageHashCheckResult {
  isDuplicate: boolean;
  reason?: string;
}

export interface MealRecordTimestamp {
  recordedAt: Date;
}

export interface AbnormalPatternResult {
  isSuspicious: boolean;
  reason?: string;
  severity: AntiCheatSeverity;
}

export interface BanCheckInput {
  /** Number of confirmed high-severity violations */
  highSeverityCount: number;
  /** Whether the account is already banned */
  isBanned: boolean;
}

export interface BanCheckResult {
  shouldBan: boolean;
  reason?: string;
}

export interface IdentityConsistencyInput {
  /** Payment account identifier used for deposit */
  paymentIdentity: string;
  /** Account identifier used for withdrawal */
  withdrawalIdentity: string;
}

export interface IdentityConsistencyResult {
  isConsistent: boolean;
  reason?: string;
}

export interface AntiCheatLogEntry {
  userId: string;
  deviceId?: string;
  actionType: string;
  suspiciousReason: string;
  severity: AntiCheatSeverity;
}

// --- Pure Functions ---

/**
 * Check if a device ID is allowed to participate in a new challenge.
 * Requirement 21.1: Same device can only participate in one concurrent Challenge.
 */
export function checkDeviceUniqueness(input: UniquenessCheckInput): UniquenessCheckResult {
  if (!input.identifier || input.identifier.trim().length === 0) {
    return { allowed: false, reason: '设备 ID 不能为空' };
  }

  const isDuplicate = input.activeIdentifiers.includes(input.identifier);
  if (isDuplicate) {
    return {
      allowed: false,
      reason: '该设备已有进行中的挑战，同一设备不能同时参与多个挑战',
    };
  }

  return { allowed: true };
}

/**
 * Check if a phone number is allowed to participate in a new challenge.
 * Requirement 21.2: Same phone number can only participate in one concurrent Challenge.
 */
export function checkPhoneUniqueness(input: UniquenessCheckInput): UniquenessCheckResult {
  if (!input.identifier || input.identifier.trim().length === 0) {
    return { allowed: false, reason: '手机号不能为空' };
  }

  const isDuplicate = input.activeIdentifiers.includes(input.identifier);
  if (isDuplicate) {
    return {
      allowed: false,
      reason: '该手机号已有进行中的挑战，同一手机号不能同时参与多个挑战',
    };
  }

  return { allowed: true };
}

/**
 * Check if a payment account is allowed to participate in a new challenge.
 * Requirement 21.3: Same payment account can only participate in one concurrent Challenge.
 */
export function checkPaymentAccountUniqueness(input: UniquenessCheckInput): UniquenessCheckResult {
  if (!input.identifier || input.identifier.trim().length === 0) {
    return { allowed: false, reason: '支付账户不能为空' };
  }

  const isDuplicate = input.activeIdentifiers.includes(input.identifier);
  if (isDuplicate) {
    return {
      allowed: false,
      reason: '该支付账户已有进行中的挑战，同一支付账户不能同时参与多个挑战',
    };
  }

  return { allowed: true };
}

/**
 * Generic uniqueness check for any identifier type.
 * Requirement 21.1, 21.2, 21.3: Uniqueness enforcement.
 */
export function checkIdentifierUniqueness(
  identifier: string,
  activeIdentifiers: string[],
  identifierLabel: string,
): UniquenessCheckResult {
  if (!identifier || identifier.trim().length === 0) {
    return { allowed: false, reason: `${identifierLabel}不能为空` };
  }

  const isDuplicate = activeIdentifiers.includes(identifier);
  if (isDuplicate) {
    return {
      allowed: false,
      reason: `该${identifierLabel}已有进行中的挑战，同一${identifierLabel}不能同时参与多个挑战`,
    };
  }

  return { allowed: true };
}

/**
 * Check if an uploaded image hash is a duplicate of existing records.
 * Requirement 21.4: Detect duplicate uploaded photos → mark record invalid.
 */
export function checkImageHashDuplicate(input: ImageHashCheckInput): ImageHashCheckResult {
  if (!input.imageHash || input.imageHash.trim().length === 0) {
    return { isDuplicate: false };
  }

  const isDuplicate = input.existingHashes.includes(input.imageHash);
  if (isDuplicate) {
    return {
      isDuplicate: true,
      reason: '检测到重复上传的照片，该记录将被判定为无效',
    };
  }

  return { isDuplicate: false };
}

/**
 * Detect batch add pattern: too many records in a short time window.
 * Requirement 21.5: Detect abnormal record patterns (batch add).
 */
export function detectBatchAddPattern(
  timestamps: MealRecordTimestamp[],
  windowMinutes: number = BATCH_ADD_WINDOW_MINUTES,
  threshold: number = BATCH_ADD_THRESHOLD,
): AbnormalPatternResult {
  if (timestamps.length < threshold) {
    return { isSuspicious: false, severity: 'low' };
  }

  // Sort by time ascending
  const sorted = [...timestamps].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
  );

  const windowMs = windowMinutes * 60 * 1000;

  // Sliding window: check if any window of `windowMinutes` contains >= threshold records
  for (let i = 0; i <= sorted.length - threshold; i++) {
    const windowStart = sorted[i].recordedAt.getTime();
    const windowEnd = windowStart + windowMs;

    let count = 0;
    for (let j = i; j < sorted.length; j++) {
      if (sorted[j].recordedAt.getTime() <= windowEnd) {
        count++;
      } else {
        break;
      }
    }

    if (count >= threshold) {
      return {
        isSuspicious: true,
        reason: `在 ${windowMinutes} 分钟内添加了 ${count} 条记录，疑似批量添加`,
        severity: 'medium',
      };
    }
  }

  return { isSuspicious: false, severity: 'low' };
}

/**
 * Detect time anomaly: records added too quickly in succession.
 * Requirement 21.5: Detect abnormal record patterns (time anomaly).
 */
export function detectTimeAnomaly(
  timestamps: MealRecordTimestamp[],
  minIntervalSeconds: number = MIN_RECORD_INTERVAL_SECONDS,
): AbnormalPatternResult {
  if (timestamps.length < 2) {
    return { isSuspicious: false, severity: 'low' };
  }

  const sorted = [...timestamps].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
  );

  const minIntervalMs = minIntervalSeconds * 1000;

  for (let i = 1; i < sorted.length; i++) {
    const interval = sorted[i].recordedAt.getTime() - sorted[i - 1].recordedAt.getTime();
    if (interval < minIntervalMs) {
      return {
        isSuspicious: true,
        reason: `两条记录间隔仅 ${Math.floor(interval / 1000)} 秒，疑似异常操作`,
        severity: 'low',
      };
    }
  }

  return { isSuspicious: false, severity: 'low' };
}

/**
 * Determine if an account should be banned based on violation history.
 * Requirement 21.7: Cheating account → ban and no cashback.
 */
export function shouldBanAccount(input: BanCheckInput): BanCheckResult {
  if (input.isBanned) {
    return { shouldBan: true, reason: '账号已被封禁' };
  }

  if (input.highSeverityCount >= AUTO_BAN_VIOLATION_THRESHOLD) {
    return {
      shouldBan: true,
      reason: `累计 ${input.highSeverityCount} 次严重违规，账号将被封禁且不予返现`,
    };
  }

  return { shouldBan: false };
}

/**
 * Verify that payment identity matches withdrawal identity.
 * Requirement 21.8: Payment identity must match withdrawal identity.
 */
export function checkIdentityConsistency(
  input: IdentityConsistencyInput,
): IdentityConsistencyResult {
  if (!input.paymentIdentity || input.paymentIdentity.trim().length === 0) {
    return { isConsistent: false, reason: '支付身份信息缺失' };
  }

  if (!input.withdrawalIdentity || input.withdrawalIdentity.trim().length === 0) {
    return { isConsistent: false, reason: '提现身份信息缺失' };
  }

  const isConsistent =
    input.paymentIdentity.trim() === input.withdrawalIdentity.trim();

  if (!isConsistent) {
    return {
      isConsistent: false,
      reason: '支付身份与提现身份不一致，无法提现',
    };
  }

  return { isConsistent: true };
}

/**
 * Build an anti-cheat log entry for audit purposes.
 * Requirement 21.9: Log all suspicious behavior for audit.
 */
export function buildAntiCheatLogEntry(
  userId: string,
  actionType: string,
  suspiciousReason: string,
  severity: AntiCheatSeverity,
  deviceId?: string,
): AntiCheatLogEntry {
  return {
    userId,
    deviceId,
    actionType,
    suspiciousReason,
    severity,
  };
}

/**
 * Determine the severity level based on the type of violation.
 * Requirement 21.9: Classify suspicious behavior.
 */
export function determineSeverity(actionType: string): AntiCheatSeverity {
  const highSeverityActions = [
    'duplicate_image',
    'identity_mismatch',
    'account_ban',
  ];
  const mediumSeverityActions = [
    'batch_add',
    'device_duplicate',
    'phone_duplicate',
    'payment_duplicate',
  ];

  if (highSeverityActions.includes(actionType)) return 'high';
  if (mediumSeverityActions.includes(actionType)) return 'medium';
  return 'low';
}

/**
 * Run all pre-challenge uniqueness checks.
 * Requirement 21.1, 21.2, 21.3: Combined uniqueness validation.
 */
export function validateChallengeEligibility(params: {
  deviceId: string;
  phone: string;
  paymentAccount: string;
  activeDeviceIds: string[];
  activePhones: string[];
  activePaymentAccounts: string[];
}): { eligible: boolean; violations: AntiCheatLogEntry[]; reasons: string[] } {
  const violations: AntiCheatLogEntry[] = [];
  const reasons: string[] = [];

  const deviceCheck = checkDeviceUniqueness({
    identifier: params.deviceId,
    activeIdentifiers: params.activeDeviceIds,
  });
  if (!deviceCheck.allowed) {
    reasons.push(deviceCheck.reason!);
    violations.push(
      buildAntiCheatLogEntry('', 'device_duplicate', deviceCheck.reason!, 'medium', params.deviceId),
    );
  }

  const phoneCheck = checkPhoneUniqueness({
    identifier: params.phone,
    activeIdentifiers: params.activePhones,
  });
  if (!phoneCheck.allowed) {
    reasons.push(phoneCheck.reason!);
    violations.push(
      buildAntiCheatLogEntry('', 'phone_duplicate', phoneCheck.reason!, 'medium'),
    );
  }

  const paymentCheck = checkPaymentAccountUniqueness({
    identifier: params.paymentAccount,
    activeIdentifiers: params.activePaymentAccounts,
  });
  if (!paymentCheck.allowed) {
    reasons.push(paymentCheck.reason!);
    violations.push(
      buildAntiCheatLogEntry('', 'payment_duplicate', paymentCheck.reason!, 'medium'),
    );
  }

  return {
    eligible: violations.length === 0,
    violations,
    reasons,
  };
}

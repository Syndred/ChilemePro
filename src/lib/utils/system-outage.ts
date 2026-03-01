/**
 * Pure system outage business logic — no side effects, fully testable.
 *
 * Requirement 24.1: Record outage time periods when system failures prevent submissions
 * Requirement 24.2: Auto-validate daily tasks during outage periods
 * Requirement 24.3: Notify affected users when outage exceeds 2 hours
 * Requirement 24.4: Full deposit refund when outage causes challenge failure
 * Requirement 24.5: Provide user appeal channel
 * Requirement 24.6: Process appeal refunds within 3 business days
 */

import type { OutageStatus, AppealStatus } from '@/types';

// --- Constants ---

/** Outage duration threshold (ms) for triggering user notifications */
export const OUTAGE_NOTIFICATION_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Maximum appeal reason length */
export const MAX_APPEAL_REASON_LENGTH = 1000;

/** Minimum appeal reason length */
export const MIN_APPEAL_REASON_LENGTH = 10;

/** Refund processing deadline in business days */
export const REFUND_PROCESSING_DAYS = 3;

// --- Types ---

export interface OutageRecord {
  id: string;
  startTime: Date;
  endTime: Date | null;
  status: OutageStatus;
}

export interface OutageDurationResult {
  durationMs: number;
  durationHours: number;
  exceedsNotificationThreshold: boolean;
}

export interface OutageTaskValidationResult {
  taskDate: Date;
  isAffectedByOutage: boolean;
  shouldAutoValidate: boolean;
  outageId: string | null;
}

export interface OutageRefundEligibility {
  eligible: boolean;
  refundAmount: number;
  reason?: string;
}

export interface AppealValidation {
  valid: boolean;
  reason?: string;
}

export interface NotificationCheck {
  shouldNotify: boolean;
  affectedUserIds: string[];
  outageDurationHours: number;
}

// --- Pure Functions ---

/**
 * Calculate the duration of an outage.
 * Requirement 24.1: Record outage time periods.
 * Requirement 24.3: Notify when outage exceeds 2 hours.
 */
export function calculateOutageDuration(
  startTime: Date,
  endTime: Date | null,
  now: Date = new Date(),
): OutageDurationResult {
  const end = endTime ?? now;
  const durationMs = Math.max(0, end.getTime() - startTime.getTime());
  const durationHours = durationMs / (1000 * 60 * 60);

  return {
    durationMs,
    durationHours,
    exceedsNotificationThreshold: durationMs >= OUTAGE_NOTIFICATION_THRESHOLD_MS,
  };
}

/**
 * Check if a specific date/time falls within an outage period.
 * Requirement 24.2: Auto-validate tasks during outage.
 */
export function isTimeWithinOutage(
  time: Date,
  outageStart: Date,
  outageEnd: Date | null,
): boolean {
  const t = time.getTime();
  const start = outageStart.getTime();
  const end = outageEnd ? outageEnd.getTime() : Infinity;
  return t >= start && t <= end;
}

/**
 * Check if a daily task date is affected by an outage.
 * A task date is affected if the outage overlaps with any part of that day.
 * Requirement 24.2: Auto-validate tasks during outage.
 */
export function isTaskDateAffectedByOutage(
  taskDate: Date,
  outageStart: Date,
  outageEnd: Date | null,
): boolean {
  const dayStart = new Date(taskDate);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(taskDate);
  dayEnd.setHours(23, 59, 59, 999);

  const oStart = outageStart.getTime();
  const oEnd = outageEnd ? outageEnd.getTime() : Infinity;

  // Overlap: outage starts before day ends AND outage ends after day starts
  return oStart <= dayEnd.getTime() && oEnd >= dayStart.getTime();
}

/**
 * Determine if a daily task should be auto-validated due to an outage.
 * Requirement 24.2: Auto-validate tasks during outage periods.
 */
export function shouldAutoValidateTask(
  taskDate: Date,
  taskCompleted: boolean,
  outages: Array<{ startTime: Date; endTime: Date | null; id: string }>,
): OutageTaskValidationResult {
  // If already completed, no need to auto-validate
  if (taskCompleted) {
    return {
      taskDate,
      isAffectedByOutage: false,
      shouldAutoValidate: false,
      outageId: null,
    };
  }

  // Check if any outage affects this task date
  for (const outage of outages) {
    if (isTaskDateAffectedByOutage(taskDate, outage.startTime, outage.endTime)) {
      return {
        taskDate,
        isAffectedByOutage: true,
        shouldAutoValidate: true,
        outageId: outage.id,
      };
    }
  }

  return {
    taskDate,
    isAffectedByOutage: false,
    shouldAutoValidate: false,
    outageId: null,
  };
}

/**
 * Check if an outage should trigger user notifications.
 * Requirement 24.3: Notify when outage exceeds 2 hours.
 */
export function shouldNotifyUsers(
  outageStart: Date,
  outageEnd: Date | null,
  now: Date = new Date(),
): boolean {
  const duration = calculateOutageDuration(outageStart, outageEnd, now);
  return duration.exceedsNotificationThreshold;
}

/**
 * Determine if a user is eligible for a full refund due to system outage.
 * Requirement 24.4: Full deposit refund when outage causes challenge failure.
 */
export function checkOutageRefundEligibility(
  challengeStatus: string,
  challengeDeposit: number,
  taskDates: Date[],
  outages: Array<{ startTime: Date; endTime: Date | null }>,
): OutageRefundEligibility {
  // Only failed challenges are eligible for outage refund
  if (challengeStatus !== 'failed') {
    return {
      eligible: false,
      refundAmount: 0,
      reason: '仅失败的挑战可申请系统故障退款',
    };
  }

  // Check if any task date was affected by an outage
  const hasAffectedTask = taskDates.some((taskDate) =>
    outages.some((outage) =>
      isTaskDateAffectedByOutage(taskDate, outage.startTime, outage.endTime),
    ),
  );

  if (!hasAffectedTask) {
    return {
      eligible: false,
      refundAmount: 0,
      reason: '挑战期间未受系统故障影响',
    };
  }

  return {
    eligible: true,
    refundAmount: challengeDeposit,
  };
}

/**
 * Validate a user appeal submission.
 * Requirement 24.5: Provide user appeal channel.
 */
export function validateAppeal(
  reason: string,
  hasExistingPendingAppeal: boolean,
): AppealValidation {
  if (hasExistingPendingAppeal) {
    return {
      valid: false,
      reason: '您已有待处理的申诉，请等待处理完成后再提交',
    };
  }

  if (!reason || reason.trim().length < MIN_APPEAL_REASON_LENGTH) {
    return {
      valid: false,
      reason: `申诉原因不能少于 ${MIN_APPEAL_REASON_LENGTH} 个字符`,
    };
  }

  if (reason.trim().length > MAX_APPEAL_REASON_LENGTH) {
    return {
      valid: false,
      reason: `申诉原因不能超过 ${MAX_APPEAL_REASON_LENGTH} 个字符`,
    };
  }

  return { valid: true };
}

/**
 * Calculate the refund deadline based on appeal approval date.
 * Requirement 24.6: Process refund within 3 business days.
 */
export function calculateRefundDeadline(approvalDate: Date): Date {
  const deadline = new Date(approvalDate);
  let businessDaysAdded = 0;

  while (businessDaysAdded < REFUND_PROCESSING_DAYS) {
    deadline.setDate(deadline.getDate() + 1);
    const dayOfWeek = deadline.getDay();
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDaysAdded++;
    }
  }

  return deadline;
}

/**
 * Check if a refund is overdue based on the deadline.
 * Requirement 24.6: Process within 3 business days.
 */
export function isRefundOverdue(
  approvalDate: Date,
  now: Date = new Date(),
): boolean {
  const deadline = calculateRefundDeadline(approvalDate);
  return now > deadline;
}

/**
 * Determine the refund amount for an approved appeal.
 * Requirement 24.4: Full deposit refund.
 */
export function getAppealRefundAmount(
  appealStatus: AppealStatus,
  challengeDeposit: number,
): number {
  if (appealStatus !== 'approved') return 0;
  return challengeDeposit;
}

/**
 * Get affected challenge user IDs during an outage period.
 * Returns user IDs of users who had active challenges during the outage.
 */
export function getAffectedUserIds(
  activeChallenges: Array<{ userId: string; startDate: Date; endDate: Date }>,
  outageStart: Date,
  outageEnd: Date | null,
): string[] {
  return activeChallenges
    .filter((ch) => {
      const chStart = new Date(ch.startDate);
      chStart.setHours(0, 0, 0, 0);
      const chEnd = new Date(ch.endDate);
      chEnd.setHours(23, 59, 59, 999);

      const oStart = outageStart.getTime();
      const oEnd = outageEnd ? outageEnd.getTime() : Infinity;

      // Challenge period overlaps with outage period
      return oStart <= chEnd.getTime() && oEnd >= chStart.getTime();
    })
    .map((ch) => ch.userId);
}

/**
 * Pure challenge business logic — no side effects, fully testable.
 *
 * Requirement 9.1: 100 元 deposit
 * Requirement 9.2: 7-day challenge starting from payment day 00:00
 * Requirement 9.3: Daily tasks: 三餐记录 + 热量达标
 * Requirement 9.4: Optional tasks: exercise/steps
 * Requirement 9.5: One active challenge per user
 * Requirement 9.6: No refund after challenge starts
 * Requirement 9.7: Full refund before challenge starts
 * Requirement 9.8: Lock deposit when challenge starts
 */

import type { ChallengeStatus } from '@/types';

// --- Constants ---

/** Fixed deposit amount in CNY */
export const CHALLENGE_DEPOSIT = 100;

/** Challenge duration in days */
export const CHALLENGE_DURATION_DAYS = 7;

/** Daily reward amounts for D1-D7 */
export const DAILY_REWARDS: Record<number, number> = {
  1: 6,
  2: 8,
  3: 10,
  4: 12,
  5: 15,
  6: 20,
  7: 29,
};

/** Total possible reward: 6+8+10+12+15+20+29 = 100 */
export const TOTAL_POSSIBLE_REWARD = Object.values(DAILY_REWARDS).reduce(
  (sum, v) => sum + v,
  0,
);

// --- Types ---

export interface ChallengeCanJoinResult {
  canJoin: boolean;
  reason?: string;
}

export interface ChallengeRefundResult {
  canRefund: boolean;
  refundAmount: number;
  reason?: string;
}

export interface ChallengeCreateResult {
  startDate: Date;
  endDate: Date;
  deposit: number;
  dailyTasks: Array<{
    day: number;
    taskDate: Date;
    reward: number;
  }>;
}

// --- Pure Functions ---

/**
 * Check if a user can join a new challenge.
 * Requirement 9.5: User can only have one active/pending challenge at a time.
 */
export function canUserJoinChallenge(
  existingStatuses: ChallengeStatus[],
): ChallengeCanJoinResult {
  const hasActive = existingStatuses.some(
    (s) => s === 'active' || s === 'pending',
  );

  if (hasActive) {
    return {
      canJoin: false,
      reason: '您已有进行中的挑战，无法同时参与多个挑战',
    };
  }

  return { canJoin: true };
}

/**
 * Build a new challenge with daily tasks.
 * Requirement 9.2: 7 calendar days starting from payment day 00:00.
 * Requirement 9.3: Daily tasks defined.
 */
export function buildNewChallenge(paymentDate: Date): ChallengeCreateResult {
  // Start date is the beginning of the payment day
  const startDate = new Date(paymentDate);
  startDate.setHours(0, 0, 0, 0);

  // End date is 6 days later (7 calendar days total)
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + CHALLENGE_DURATION_DAYS - 1);
  endDate.setHours(23, 59, 59, 999);

  const dailyTasks = [];
  for (let day = 1; day <= CHALLENGE_DURATION_DAYS; day++) {
    const taskDate = new Date(startDate);
    taskDate.setDate(taskDate.getDate() + day - 1);
    dailyTasks.push({
      day,
      taskDate,
      reward: DAILY_REWARDS[day],
    });
  }

  return {
    startDate,
    endDate,
    deposit: CHALLENGE_DEPOSIT,
    dailyTasks,
  };
}

/**
 * Determine if a challenge can be refunded.
 * Requirement 9.6: No refund after challenge starts (active).
 * Requirement 9.7: Full refund before challenge starts (pending).
 */
export function canRefundChallenge(
  status: ChallengeStatus,
  challengeStartDate: Date,
  now: Date,
): ChallengeRefundResult {
  if (status === 'completed' || status === 'failed') {
    return {
      canRefund: false,
      refundAmount: 0,
      reason: '挑战已结束，无法退款',
    };
  }

  if (status === 'active') {
    return {
      canRefund: false,
      refundAmount: 0,
      reason: '挑战已开始，无法退款',
    };
  }

  // status === 'pending'
  // Double-check: if current time is past start date, it should be active
  // but we still respect the status field as the source of truth
  if (status === 'pending') {
    const startTime = new Date(challengeStartDate);
    startTime.setHours(0, 0, 0, 0);

    if (now >= startTime) {
      return {
        canRefund: false,
        refundAmount: 0,
        reason: '挑战已到开始时间，无法退款',
      };
    }

    return {
      canRefund: true,
      refundAmount: CHALLENGE_DEPOSIT,
    };
  }

  return {
    canRefund: false,
    refundAmount: 0,
    reason: '未知挑战状态',
  };
}

/**
 * Get the reward amount for a specific day.
 * Requirement 10.5: D1=6, D2=8, D3=10, D4=12, D5=15, D6=20, D7=29
 */
export function getDailyReward(day: number): number {
  if (day < 1 || day > 7) return 0;
  return DAILY_REWARDS[day];
}

/**
 * Check if a daily task is complete.
 * Requirement 10.8: Must complete 三餐 or 加餐 records AND calorie within ±10% of target.
 */
export function isDailyTaskComplete(
  mealRecorded: boolean,
  totalCalories: number,
  targetCalories: number,
): boolean {
  if (!mealRecorded) return false;
  if (targetCalories <= 0) return false;

  const deviation = Math.abs(totalCalories - targetCalories) / targetCalories;
  return deviation <= 0.1;
}

/**
 * Check if a submission is within the daily deadline.
 * Requirement 10.1: Daily task deadline is 23:30.
 * Requirement 10.2: No late submissions after 23:30.
 */
export function isWithinDailyDeadline(now: Date): boolean {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  // Before 23:30
  return hours < 23 || (hours === 23 && minutes < 30);
}

/**
 * Determine the current challenge status based on dates.
 * Used to transition pending → active when start date arrives.
 */
export function determineChallengeStatus(
  currentStatus: ChallengeStatus,
  startDate: Date,
  endDate: Date,
  now: Date,
): ChallengeStatus {
  if (currentStatus === 'completed' || currentStatus === 'failed') {
    return currentStatus;
  }

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  if (now < start) return 'pending';
  if (now > end) return 'completed';
  return 'active';
}

// --- Settlement & Reward Pool Types ---

export interface DailySettlementInput {
  day: number;
  completed: boolean;
  reward: number;
}

export interface DailySettlementResult {
  day: number;
  completed: boolean;
  cashbackAmount: number;
  rewardPoolAmount: number;
}

export interface SettlementSummary {
  totalCashback: number;
  totalToRewardPool: number;
  results: DailySettlementResult[];
}

// --- Settlement & Reward Pool Functions ---

/**
 * Settle a single daily task: completed → cashback, uncompleted → reward pool.
 * Requirement 10.6: Completed task → cashback to user account
 * Requirement 10.7: Uncompleted task → amount goes to reward pool
 */
export function settleDailyTask(input: DailySettlementInput): DailySettlementResult {
  const reward = getDailyReward(input.day);
  if (input.completed) {
    return {
      day: input.day,
      completed: true,
      cashbackAmount: reward,
      rewardPoolAmount: 0,
    };
  }
  return {
    day: input.day,
    completed: false,
    cashbackAmount: 0,
    rewardPoolAmount: reward,
  };
}

/**
 * Settle multiple daily tasks and produce a summary.
 * Requirement 10.6, 10.7: Cashback for completed, reward pool for uncompleted.
 */
export function settleMultipleDailyTasks(
  tasks: DailySettlementInput[],
): SettlementSummary {
  const results = tasks.map(settleDailyTask);
  return {
    totalCashback: results.reduce((sum, r) => sum + r.cashbackAmount, 0),
    totalToRewardPool: results.reduce((sum, r) => sum + r.rewardPoolAmount, 0),
    results,
  };
}

/**
 * Calculate the total amount transferred to the reward pool for uncompleted days.
 * Requirement 10.7: Uncompleted task amounts go to reward pool.
 */
export function calculateRewardPoolContribution(
  completedDays: boolean[],
): number {
  let total = 0;
  for (let day = 1; day <= CHALLENGE_DURATION_DAYS; day++) {
    if (!completedDays[day - 1]) {
      total += getDailyReward(day);
    }
  }
  return total;
}

// --- Notification / Reminder Logic ---

/** Reminder time: 22:00 */
export const TASK_REMINDER_HOUR = 22;
export const TASK_REMINDER_MINUTE = 0;

/** Daily deadline: 23:30 */
export const DAILY_DEADLINE_HOUR = 23;
export const DAILY_DEADLINE_MINUTE = 30;

/** Settlement window start: 23:30 */
export const SETTLEMENT_START_HOUR = 23;
export const SETTLEMENT_START_MINUTE = 30;

/**
 * Check if it's time to send the 22:00 task reminder.
 * Requirement 10.9: Send task reminder at 22:00 to users who haven't completed.
 * Returns true during the 22:00-22:14 window.
 */
export function isTaskReminderTime(now: Date): boolean {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  return hours === TASK_REMINDER_HOUR && minutes >= TASK_REMINDER_MINUTE && minutes < TASK_REMINDER_MINUTE + 15;
}

/**
 * Check if a user should receive a task reminder.
 * Requirement 10.9: Only send to users who haven't completed today's task.
 */
export function shouldSendTaskReminder(
  hasActiveChallenge: boolean,
  todayTaskCompleted: boolean,
): boolean {
  return hasActiveChallenge && !todayTaskCompleted;
}

/**
 * Check if current time is within the settlement window (23:30 - 23:59).
 * Requirement 10.3: Auto-settlement between 23:30 and 23:59.
 */
export function isInSettlementWindow(now: Date): boolean {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  return hours === 23 && minutes >= 30;
}

/**
 * Calculate the total cashback earned so far for a challenge.
 * Sums up rewards for all completed days.
 */
export function calculateTotalCashback(completedDays: boolean[]): number {
  let total = 0;
  for (let day = 1; day <= CHALLENGE_DURATION_DAYS; day++) {
    if (completedDays[day - 1]) {
      total += getDailyReward(day);
    }
  }
  return total;
}

// --- Reward Pool Distribution Types ---

/** Platform commission rate: 15% */
export const PLATFORM_COMMISSION_RATE = 0.15;

/** User share rate: 85% */
export const USER_SHARE_RATE = 0.85;

/** Maximum bonus per user: deposit × 2 */
export const MAX_BONUS_MULTIPLIER = 2;

export interface RewardPoolInput {
  /** Total reward pool amount (sum of uncompleted day rewards across all participants) */
  totalPool: number;
  /** Number of users who completed all 7 days */
  perfectAttendanceCount: number;
  /** Deposit amount per user */
  depositPerUser: number;
  /** Carry-over from previous period (optional) */
  previousCarryOver?: number;
}

export interface RewardPoolDistribution {
  /** Total pool including carry-over */
  totalPool: number;
  /** Platform commission (15%) */
  platformCommission: number;
  /** Amount available for distribution (85%) */
  distributableAmount: number;
  /** Per-user bonus (capped at deposit × 2) */
  perUserBonus: number;
  /** Number of users receiving bonus */
  recipientCount: number;
  /** Total actually distributed to users */
  totalDistributed: number;
  /** Amount to carry over to next period (undistributed due to cap or no recipients) */
  carryOver: number;
}

// --- Reward Pool Distribution Functions ---

/**
 * Calculate the reward pool total from uncompleted daily tasks across all participants.
 * Requirement 11.1: Reward pool = sum of all uncompleted day amounts.
 *
 * @param participantCompletions - Array of boolean arrays, one per participant,
 *   each indicating which of the 7 days were completed.
 * @param previousCarryOver - Amount carried over from previous period.
 */
export function calculateRewardPoolTotal(
  participantCompletions: boolean[][],
  previousCarryOver: number = 0,
): number {
  let total = previousCarryOver;
  for (const completedDays of participantCompletions) {
    total += calculateRewardPoolContribution(completedDays);
  }
  return total;
}

/**
 * Determine which users achieved perfect attendance (all 7 days completed).
 * Requirement 11.4: User who completed all 7 days is a perfect attendance user.
 */
export function isPerfectAttendance(completedDays: boolean[]): boolean {
  if (completedDays.length < CHALLENGE_DURATION_DAYS) return false;
  for (let i = 0; i < CHALLENGE_DURATION_DAYS; i++) {
    if (!completedDays[i]) return false;
  }
  return true;
}

/**
 * Distribute the reward pool to perfect attendance users.
 * Requirement 11.2: Deduct 15% platform commission.
 * Requirement 11.3: Distribute remaining 85% equally to perfect attendance users.
 * Requirement 11.5: Per-user bonus capped at deposit × 2.
 * Requirement 11.6: If no perfect attendance users, carry over to next period.
 */
export function distributeRewardPool(input: RewardPoolInput): RewardPoolDistribution {
  const totalPool = input.totalPool + (input.previousCarryOver ?? 0);

  // Platform takes 15%
  const platformCommission = Math.floor(totalPool * PLATFORM_COMMISSION_RATE * 100) / 100;
  const distributableAmount = Math.floor((totalPool - platformCommission) * 100) / 100;

  // No perfect attendance users → carry over the distributable amount
  if (input.perfectAttendanceCount <= 0) {
    return {
      totalPool,
      platformCommission,
      distributableAmount,
      perUserBonus: 0,
      recipientCount: 0,
      totalDistributed: 0,
      carryOver: distributableAmount,
    };
  }

  // Calculate per-user share
  const rawPerUserBonus = distributableAmount / input.perfectAttendanceCount;

  // Cap at deposit × 2
  const maxBonus = input.depositPerUser * MAX_BONUS_MULTIPLIER;
  const perUserBonus = Math.min(
    Math.floor(rawPerUserBonus * 100) / 100,
    maxBonus,
  );

  const totalDistributed = Math.floor(perUserBonus * input.perfectAttendanceCount * 100) / 100;
  const carryOver = Math.floor((distributableAmount - totalDistributed) * 100) / 100;

  return {
    totalPool,
    platformCommission,
    distributableAmount,
    perUserBonus,
    recipientCount: input.perfectAttendanceCount,
    totalDistributed,
    carryOver,
  };
}


// --- Leaderboard Ranking ---

export interface LeaderboardEntryInput {
  userId: string;
  nickname: string;
  avatar: string;
  completedDays: number;
  /** Timestamp of the latest completed task (for tiebreaking) */
  lastCompletedAt: Date | null;
}

export interface RankedLeaderboardEntry extends LeaderboardEntryInput {
  rank: number;
}

/**
 * Rank leaderboard entries by completed days (desc), then by last completed time (asc).
 * Earlier completion time ranks higher when days are equal.
 * Requirement 12.2: Sort by completed days and completion time.
 * Requirement 12.3: Display rank, nickname, completed days.
 * Requirement 12.4: Protect privacy — only nickname and avatar shown.
 */
export function rankLeaderboard(
  entries: LeaderboardEntryInput[],
): RankedLeaderboardEntry[] {
  const sorted = [...entries].sort((a, b) => {
    // Primary: more completed days first
    if (b.completedDays !== a.completedDays) {
      return b.completedDays - a.completedDays;
    }
    // Secondary: earlier last-completed time first (faster = better)
    const aTime = a.lastCompletedAt?.getTime() ?? Infinity;
    const bTime = b.lastCompletedAt?.getTime() ?? Infinity;
    return aTime - bTime;
  });

  return sorted.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

/**
 * Mask a nickname for privacy display.
 * Shows first char + asterisks for the rest.
 * Requirement 12.4: Protect user privacy.
 */
export function maskNickname(nickname: string): string {
  if (!nickname || nickname.length === 0) return '***';
  if (nickname.length === 1) return nickname + '**';
  if (nickname.length === 2) return nickname[0] + '*';
  return nickname[0] + '*'.repeat(nickname.length - 2) + nickname[nickname.length - 1];
}

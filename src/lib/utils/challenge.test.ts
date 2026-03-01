import { describe, it, expect } from 'vitest';
import {
  canUserJoinChallenge,
  buildNewChallenge,
  canRefundChallenge,
  getDailyReward,
  isDailyTaskComplete,
  isWithinDailyDeadline,
  determineChallengeStatus,
  CHALLENGE_DEPOSIT,
  CHALLENGE_DURATION_DAYS,
  DAILY_REWARDS,
  TOTAL_POSSIBLE_REWARD,
} from './challenge';

// --- canUserJoinChallenge ---

describe('canUserJoinChallenge', () => {
  it('allows joining when no existing challenges', () => {
    const result = canUserJoinChallenge([]);
    expect(result.canJoin).toBe(true);
  });

  it('allows joining when only completed/failed challenges exist', () => {
    const result = canUserJoinChallenge(['completed', 'failed']);
    expect(result.canJoin).toBe(true);
  });

  it('blocks joining when an active challenge exists', () => {
    const result = canUserJoinChallenge(['active']);
    expect(result.canJoin).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('blocks joining when a pending challenge exists', () => {
    const result = canUserJoinChallenge(['pending']);
    expect(result.canJoin).toBe(false);
  });

  it('blocks joining when both active and completed exist', () => {
    const result = canUserJoinChallenge(['completed', 'active']);
    expect(result.canJoin).toBe(false);
  });
});

// --- buildNewChallenge ---

describe('buildNewChallenge', () => {
  it('creates a 7-day challenge starting from payment day 00:00', () => {
    const paymentDate = new Date('2025-03-10T14:30:00');
    const result = buildNewChallenge(paymentDate);

    expect(result.startDate.getHours()).toBe(0);
    expect(result.startDate.getMinutes()).toBe(0);
    expect(result.startDate.getDate()).toBe(10);
  });

  it('sets end date to 6 days after start', () => {
    const paymentDate = new Date('2025-03-10T14:30:00');
    const result = buildNewChallenge(paymentDate);

    const diffMs = result.endDate.getTime() - result.startDate.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(CHALLENGE_DURATION_DAYS);
  });

  it('creates exactly 7 daily tasks', () => {
    const result = buildNewChallenge(new Date('2025-03-10'));
    expect(result.dailyTasks).toHaveLength(7);
  });

  it('assigns correct rewards to each day', () => {
    const result = buildNewChallenge(new Date('2025-03-10'));
    result.dailyTasks.forEach((task) => {
      expect(task.reward).toBe(DAILY_REWARDS[task.day]);
    });
  });

  it('sets deposit to CHALLENGE_DEPOSIT', () => {
    const result = buildNewChallenge(new Date());
    expect(result.deposit).toBe(CHALLENGE_DEPOSIT);
  });

  it('daily task dates are consecutive', () => {
    const result = buildNewChallenge(new Date('2025-06-01'));
    for (let i = 1; i < result.dailyTasks.length; i++) {
      const prev = result.dailyTasks[i - 1].taskDate;
      const curr = result.dailyTasks[i].taskDate;
      const diffMs = curr.getTime() - prev.getTime();
      expect(diffMs).toBe(24 * 60 * 60 * 1000);
    }
  });
});

// --- canRefundChallenge ---

describe('canRefundChallenge', () => {
  it('allows full refund for pending challenge before start date', () => {
    const startDate = new Date('2025-03-15');
    const now = new Date('2025-03-14T10:00:00');
    const result = canRefundChallenge('pending', startDate, now);

    expect(result.canRefund).toBe(true);
    expect(result.refundAmount).toBe(CHALLENGE_DEPOSIT);
  });

  it('denies refund for pending challenge after start date', () => {
    const startDate = new Date('2025-03-15');
    const now = new Date('2025-03-15T01:00:00');
    const result = canRefundChallenge('pending', startDate, now);

    expect(result.canRefund).toBe(false);
  });

  it('denies refund for active challenge', () => {
    const startDate = new Date('2025-03-10');
    const now = new Date('2025-03-12');
    const result = canRefundChallenge('active', startDate, now);

    expect(result.canRefund).toBe(false);
    expect(result.refundAmount).toBe(0);
  });

  it('denies refund for completed challenge', () => {
    const result = canRefundChallenge('completed', new Date(), new Date());
    expect(result.canRefund).toBe(false);
  });

  it('denies refund for failed challenge', () => {
    const result = canRefundChallenge('failed', new Date(), new Date());
    expect(result.canRefund).toBe(false);
  });
});

// --- getDailyReward ---

describe('getDailyReward', () => {
  it('returns correct reward for each day', () => {
    expect(getDailyReward(1)).toBe(6);
    expect(getDailyReward(2)).toBe(8);
    expect(getDailyReward(3)).toBe(10);
    expect(getDailyReward(4)).toBe(12);
    expect(getDailyReward(5)).toBe(15);
    expect(getDailyReward(6)).toBe(20);
    expect(getDailyReward(7)).toBe(29);
  });

  it('returns 0 for invalid day numbers', () => {
    expect(getDailyReward(0)).toBe(0);
    expect(getDailyReward(8)).toBe(0);
    expect(getDailyReward(-1)).toBe(0);
  });

  it('total rewards sum to deposit amount', () => {
    expect(TOTAL_POSSIBLE_REWARD).toBe(CHALLENGE_DEPOSIT);
  });
});

// --- isDailyTaskComplete ---

describe('isDailyTaskComplete', () => {
  it('returns true when meals recorded and calories within ±10%', () => {
    expect(isDailyTaskComplete(true, 2000, 2000)).toBe(true);
    expect(isDailyTaskComplete(true, 1900, 2000)).toBe(true); // -5%
    expect(isDailyTaskComplete(true, 2100, 2000)).toBe(true); // +5%
  });

  it('returns true at exactly ±10% boundary', () => {
    expect(isDailyTaskComplete(true, 1800, 2000)).toBe(true); // exactly -10%
    expect(isDailyTaskComplete(true, 2200, 2000)).toBe(true); // exactly +10%
  });

  it('returns false when calories exceed ±10%', () => {
    expect(isDailyTaskComplete(true, 1799, 2000)).toBe(false); // just over -10%
    expect(isDailyTaskComplete(true, 2201, 2000)).toBe(false); // just over +10%
  });

  it('returns false when meals not recorded', () => {
    expect(isDailyTaskComplete(false, 2000, 2000)).toBe(false);
  });

  it('returns false when target calories is 0', () => {
    expect(isDailyTaskComplete(true, 2000, 0)).toBe(false);
  });
});

// --- isWithinDailyDeadline ---

describe('isWithinDailyDeadline', () => {
  it('returns true before 23:30', () => {
    expect(isWithinDailyDeadline(new Date('2025-03-10T22:00:00'))).toBe(true);
    expect(isWithinDailyDeadline(new Date('2025-03-10T23:29:00'))).toBe(true);
    expect(isWithinDailyDeadline(new Date('2025-03-10T00:00:00'))).toBe(true);
  });

  it('returns false at 23:30 and after', () => {
    expect(isWithinDailyDeadline(new Date('2025-03-10T23:30:00'))).toBe(false);
    expect(isWithinDailyDeadline(new Date('2025-03-10T23:45:00'))).toBe(false);
    expect(isWithinDailyDeadline(new Date('2025-03-10T23:59:00'))).toBe(false);
  });
});

// --- determineChallengeStatus ---

describe('determineChallengeStatus', () => {
  it('returns pending when now is before start date', () => {
    const start = new Date('2025-03-15');
    const end = new Date('2025-03-21');
    const now = new Date('2025-03-14');
    expect(determineChallengeStatus('pending', start, end, now)).toBe('pending');
  });

  it('returns active when now is between start and end', () => {
    const start = new Date('2025-03-15');
    const end = new Date('2025-03-21');
    const now = new Date('2025-03-17');
    expect(determineChallengeStatus('pending', start, end, now)).toBe('active');
  });

  it('returns completed when now is after end date', () => {
    const start = new Date('2025-03-15');
    const end = new Date('2025-03-21');
    const now = new Date('2025-03-22');
    expect(determineChallengeStatus('active', start, end, now)).toBe('completed');
  });

  it('preserves completed status regardless of dates', () => {
    const start = new Date('2025-03-15');
    const end = new Date('2025-03-21');
    const now = new Date('2025-03-17');
    expect(determineChallengeStatus('completed', start, end, now)).toBe('completed');
  });

  it('preserves failed status regardless of dates', () => {
    const start = new Date('2025-03-15');
    const end = new Date('2025-03-21');
    const now = new Date('2025-03-17');
    expect(determineChallengeStatus('failed', start, end, now)).toBe('failed');
  });
});

// --- New imports for settlement, reward pool, and reminder tests ---

import {
  settleDailyTask,
  settleMultipleDailyTasks,
  calculateRewardPoolContribution,
  calculateTotalCashback,
  isTaskReminderTime,
  shouldSendTaskReminder,
  isInSettlementWindow,
} from './challenge';

// --- settleDailyTask ---

describe('settleDailyTask', () => {
  it('returns cashback for completed task', () => {
    const result = settleDailyTask({ day: 1, completed: true, reward: 6 });
    expect(result.cashbackAmount).toBe(6);
    expect(result.rewardPoolAmount).toBe(0);
    expect(result.completed).toBe(true);
  });

  it('returns reward pool amount for uncompleted task', () => {
    const result = settleDailyTask({ day: 1, completed: false, reward: 6 });
    expect(result.cashbackAmount).toBe(0);
    expect(result.rewardPoolAmount).toBe(6);
    expect(result.completed).toBe(false);
  });

  it('uses getDailyReward for the actual amount, not the input reward', () => {
    // Even if input.reward differs, settleDailyTask uses getDailyReward(day)
    const result = settleDailyTask({ day: 3, completed: true, reward: 999 });
    expect(result.cashbackAmount).toBe(10); // D3 = 10
  });

  it('returns 0 for invalid day', () => {
    const result = settleDailyTask({ day: 0, completed: true, reward: 0 });
    expect(result.cashbackAmount).toBe(0);
    expect(result.rewardPoolAmount).toBe(0);
  });

  it('correctly settles each day D1-D7', () => {
    const expected = [6, 8, 10, 12, 15, 20, 29];
    for (let day = 1; day <= 7; day++) {
      const completed = settleDailyTask({ day, completed: true, reward: expected[day - 1] });
      expect(completed.cashbackAmount).toBe(expected[day - 1]);

      const uncompleted = settleDailyTask({ day, completed: false, reward: expected[day - 1] });
      expect(uncompleted.rewardPoolAmount).toBe(expected[day - 1]);
    }
  });
});

// --- settleMultipleDailyTasks ---

describe('settleMultipleDailyTasks', () => {
  it('settles all completed tasks with full cashback', () => {
    const tasks = Array.from({ length: 7 }, (_, i) => ({
      day: i + 1,
      completed: true,
      reward: DAILY_REWARDS[i + 1],
    }));
    const summary = settleMultipleDailyTasks(tasks);
    expect(summary.totalCashback).toBe(100);
    expect(summary.totalToRewardPool).toBe(0);
    expect(summary.results).toHaveLength(7);
  });

  it('settles all uncompleted tasks with full reward pool', () => {
    const tasks = Array.from({ length: 7 }, (_, i) => ({
      day: i + 1,
      completed: false,
      reward: DAILY_REWARDS[i + 1],
    }));
    const summary = settleMultipleDailyTasks(tasks);
    expect(summary.totalCashback).toBe(0);
    expect(summary.totalToRewardPool).toBe(100);
  });

  it('splits correctly for mixed completion', () => {
    const tasks = [
      { day: 1, completed: true, reward: 6 },   // cashback: 6
      { day: 2, completed: false, reward: 8 },   // pool: 8
      { day: 3, completed: true, reward: 10 },   // cashback: 10
      { day: 4, completed: false, reward: 12 },  // pool: 12
    ];
    const summary = settleMultipleDailyTasks(tasks);
    expect(summary.totalCashback).toBe(16);       // 6 + 10
    expect(summary.totalToRewardPool).toBe(20);   // 8 + 12
  });

  it('handles empty task list', () => {
    const summary = settleMultipleDailyTasks([]);
    expect(summary.totalCashback).toBe(0);
    expect(summary.totalToRewardPool).toBe(0);
    expect(summary.results).toHaveLength(0);
  });

  it('cashback + rewardPool always equals total possible reward for full 7 days', () => {
    // Any combination of completed/uncompleted for 7 days should sum to 100
    const tasks = [
      { day: 1, completed: true, reward: 6 },
      { day: 2, completed: false, reward: 8 },
      { day: 3, completed: true, reward: 10 },
      { day: 4, completed: true, reward: 12 },
      { day: 5, completed: false, reward: 15 },
      { day: 6, completed: true, reward: 20 },
      { day: 7, completed: false, reward: 29 },
    ];
    const summary = settleMultipleDailyTasks(tasks);
    expect(summary.totalCashback + summary.totalToRewardPool).toBe(TOTAL_POSSIBLE_REWARD);
  });
});

// --- calculateRewardPoolContribution ---

describe('calculateRewardPoolContribution', () => {
  it('returns 0 when all days completed', () => {
    const completedDays = [true, true, true, true, true, true, true];
    expect(calculateRewardPoolContribution(completedDays)).toBe(0);
  });

  it('returns full deposit when no days completed', () => {
    const completedDays = [false, false, false, false, false, false, false];
    expect(calculateRewardPoolContribution(completedDays)).toBe(100);
  });

  it('returns correct amount for partial completion', () => {
    // D1=true(6), D2=false(8), D3=true(10), D4=false(12), D5=true(15), D6=false(20), D7=true(29)
    const completedDays = [true, false, true, false, true, false, true];
    expect(calculateRewardPoolContribution(completedDays)).toBe(8 + 12 + 20); // 40
  });

  it('handles shorter array (treats missing as uncompleted)', () => {
    // Only 3 days provided, rest are undefined (falsy)
    const completedDays = [true, true, true];
    // D1-D3 completed, D4-D7 uncompleted: 12+15+20+29 = 76
    expect(calculateRewardPoolContribution(completedDays)).toBe(76);
  });
});

// --- calculateTotalCashback ---

describe('calculateTotalCashback', () => {
  it('returns full deposit when all days completed', () => {
    const completedDays = [true, true, true, true, true, true, true];
    expect(calculateTotalCashback(completedDays)).toBe(100);
  });

  it('returns 0 when no days completed', () => {
    const completedDays = [false, false, false, false, false, false, false];
    expect(calculateTotalCashback(completedDays)).toBe(0);
  });

  it('returns correct amount for partial completion', () => {
    const completedDays = [true, false, true, false, true, false, true];
    expect(calculateTotalCashback(completedDays)).toBe(6 + 10 + 15 + 29); // 60
  });

  it('cashback + rewardPool = deposit for any completion pattern', () => {
    const completedDays = [true, true, false, false, true, false, true];
    const cashback = calculateTotalCashback(completedDays);
    const pool = calculateRewardPoolContribution(completedDays);
    expect(cashback + pool).toBe(CHALLENGE_DEPOSIT);
  });
});

// --- isTaskReminderTime ---

describe('isTaskReminderTime', () => {
  it('returns true at exactly 22:00', () => {
    expect(isTaskReminderTime(new Date('2025-03-10T22:00:00'))).toBe(true);
  });

  it('returns true at 22:05', () => {
    expect(isTaskReminderTime(new Date('2025-03-10T22:05:00'))).toBe(true);
  });

  it('returns true at 22:14', () => {
    expect(isTaskReminderTime(new Date('2025-03-10T22:14:00'))).toBe(true);
  });

  it('returns false at 22:15 (outside 15-min window)', () => {
    expect(isTaskReminderTime(new Date('2025-03-10T22:15:00'))).toBe(false);
  });

  it('returns false at 21:59', () => {
    expect(isTaskReminderTime(new Date('2025-03-10T21:59:00'))).toBe(false);
  });

  it('returns false at 23:00', () => {
    expect(isTaskReminderTime(new Date('2025-03-10T23:00:00'))).toBe(false);
  });

  it('returns false at noon', () => {
    expect(isTaskReminderTime(new Date('2025-03-10T12:00:00'))).toBe(false);
  });
});

// --- shouldSendTaskReminder ---

describe('shouldSendTaskReminder', () => {
  it('returns true when user has active challenge and task not completed', () => {
    expect(shouldSendTaskReminder(true, false)).toBe(true);
  });

  it('returns false when user has no active challenge', () => {
    expect(shouldSendTaskReminder(false, false)).toBe(false);
  });

  it('returns false when task is already completed', () => {
    expect(shouldSendTaskReminder(true, true)).toBe(false);
  });

  it('returns false when no challenge and task completed', () => {
    expect(shouldSendTaskReminder(false, true)).toBe(false);
  });
});

// --- isInSettlementWindow ---

describe('isInSettlementWindow', () => {
  it('returns true at 23:30', () => {
    expect(isInSettlementWindow(new Date('2025-03-10T23:30:00'))).toBe(true);
  });

  it('returns true at 23:45', () => {
    expect(isInSettlementWindow(new Date('2025-03-10T23:45:00'))).toBe(true);
  });

  it('returns true at 23:59', () => {
    expect(isInSettlementWindow(new Date('2025-03-10T23:59:00'))).toBe(true);
  });

  it('returns false at 23:29', () => {
    expect(isInSettlementWindow(new Date('2025-03-10T23:29:00'))).toBe(false);
  });

  it('returns false at 22:00', () => {
    expect(isInSettlementWindow(new Date('2025-03-10T22:00:00'))).toBe(false);
  });

  it('returns false at 00:00 (next day)', () => {
    expect(isInSettlementWindow(new Date('2025-03-11T00:00:00'))).toBe(false);
  });
});


// --- New imports for reward pool distribution tests ---

import {
  calculateRewardPoolTotal,
  isPerfectAttendance,
  distributeRewardPool,
} from './challenge';

// --- calculateRewardPoolTotal ---

describe('calculateRewardPoolTotal', () => {
  it('returns 0 when all participants completed all days', () => {
    const allComplete = [true, true, true, true, true, true, true];
    const result = calculateRewardPoolTotal([allComplete, allComplete]);
    expect(result).toBe(0);
  });

  it('returns full deposit per participant when nobody completed any day', () => {
    const noneComplete = [false, false, false, false, false, false, false];
    const result = calculateRewardPoolTotal([noneComplete, noneComplete]);
    expect(result).toBe(200); // 100 per participant
  });

  it('sums uncompleted day rewards across multiple participants', () => {
    // Participant 1: missed D2(8) and D5(15) → 23
    const p1 = [true, false, true, true, false, true, true];
    // Participant 2: missed D7(29) → 29
    const p2 = [true, true, true, true, true, true, false];
    const result = calculateRewardPoolTotal([p1, p2]);
    expect(result).toBe(23 + 29);
  });

  it('includes previous carry-over', () => {
    const noneComplete = [false, false, false, false, false, false, false];
    const result = calculateRewardPoolTotal([noneComplete], 50);
    expect(result).toBe(150); // 100 + 50 carry-over
  });

  it('returns only carry-over when no participants', () => {
    const result = calculateRewardPoolTotal([], 75);
    expect(result).toBe(75);
  });

  it('returns 0 with no participants and no carry-over', () => {
    expect(calculateRewardPoolTotal([])).toBe(0);
  });
});

// --- isPerfectAttendance ---

describe('isPerfectAttendance', () => {
  it('returns true when all 7 days completed', () => {
    expect(isPerfectAttendance([true, true, true, true, true, true, true])).toBe(true);
  });

  it('returns false when any day is incomplete', () => {
    expect(isPerfectAttendance([true, true, true, true, true, true, false])).toBe(false);
    expect(isPerfectAttendance([false, true, true, true, true, true, true])).toBe(false);
    expect(isPerfectAttendance([true, true, true, false, true, true, true])).toBe(false);
  });

  it('returns false when no days completed', () => {
    expect(isPerfectAttendance([false, false, false, false, false, false, false])).toBe(false);
  });

  it('returns false when array is shorter than 7', () => {
    expect(isPerfectAttendance([true, true, true])).toBe(false);
    expect(isPerfectAttendance([])).toBe(false);
  });

  it('returns true when array is longer than 7 but first 7 are all true', () => {
    expect(isPerfectAttendance([true, true, true, true, true, true, true, false])).toBe(true);
  });
});

// --- distributeRewardPool ---

describe('distributeRewardPool', () => {
  it('deducts 15% platform commission', () => {
    const result = distributeRewardPool({
      totalPool: 100,
      perfectAttendanceCount: 1,
      depositPerUser: 100,
    });
    expect(result.platformCommission).toBe(15);
    expect(result.distributableAmount).toBe(85);
  });

  it('distributes 85% equally among perfect attendance users', () => {
    const result = distributeRewardPool({
      totalPool: 200,
      perfectAttendanceCount: 2,
      depositPerUser: 100,
    });
    // 200 * 0.15 = 30 commission, 170 distributable, 85 per user
    expect(result.platformCommission).toBe(30);
    expect(result.distributableAmount).toBe(170);
    expect(result.perUserBonus).toBe(85);
    expect(result.recipientCount).toBe(2);
  });

  it('caps per-user bonus at deposit × 2', () => {
    // 1 perfect user, pool = 1000 → distributable = 850 → but cap = 200
    const result = distributeRewardPool({
      totalPool: 1000,
      perfectAttendanceCount: 1,
      depositPerUser: 100,
    });
    expect(result.perUserBonus).toBe(200); // capped at 100 * 2
    expect(result.carryOver).toBeGreaterThan(0);
  });

  it('carries over when no perfect attendance users', () => {
    const result = distributeRewardPool({
      totalPool: 100,
      perfectAttendanceCount: 0,
      depositPerUser: 100,
    });
    expect(result.perUserBonus).toBe(0);
    expect(result.recipientCount).toBe(0);
    expect(result.totalDistributed).toBe(0);
    expect(result.carryOver).toBe(85); // 85% of 100
  });

  it('includes previous carry-over in total pool', () => {
    const result = distributeRewardPool({
      totalPool: 100,
      perfectAttendanceCount: 1,
      depositPerUser: 100,
      previousCarryOver: 50,
    });
    expect(result.totalPool).toBe(150);
    // 150 * 0.15 = 22.5 → floor to 22.5
    expect(result.platformCommission).toBe(22.5);
  });

  it('handles zero pool amount', () => {
    const result = distributeRewardPool({
      totalPool: 0,
      perfectAttendanceCount: 5,
      depositPerUser: 100,
    });
    expect(result.totalPool).toBe(0);
    expect(result.platformCommission).toBe(0);
    expect(result.distributableAmount).toBe(0);
    expect(result.perUserBonus).toBe(0);
    expect(result.totalDistributed).toBe(0);
    expect(result.carryOver).toBe(0);
  });

  it('platform commission + distributable = total pool', () => {
    const result = distributeRewardPool({
      totalPool: 300,
      perfectAttendanceCount: 3,
      depositPerUser: 100,
    });
    expect(result.platformCommission + result.distributableAmount).toBe(result.totalPool);
  });

  it('totalDistributed + carryOver = distributableAmount', () => {
    const result = distributeRewardPool({
      totalPool: 500,
      perfectAttendanceCount: 2,
      depositPerUser: 100,
    });
    // With cap, there should be carry-over
    expect(result.totalDistributed + result.carryOver).toBe(result.distributableAmount);
  });

  it('distributes correctly with many users and small pool', () => {
    // 10 users, pool = 50 → distributable = 42.5 → 4.25 per user
    const result = distributeRewardPool({
      totalPool: 50,
      perfectAttendanceCount: 10,
      depositPerUser: 100,
    });
    expect(result.platformCommission).toBe(7.5);
    expect(result.distributableAmount).toBe(42.5);
    expect(result.perUserBonus).toBe(4.25);
    expect(result.recipientCount).toBe(10);
  });
});


// --- Leaderboard ranking tests ---

import { rankLeaderboard, maskNickname, type LeaderboardEntryInput } from './challenge';

describe('rankLeaderboard', () => {
  it('ranks by completed days descending', () => {
    const entries: LeaderboardEntryInput[] = [
      { userId: 'a', nickname: 'Alice', avatar: '', completedDays: 3, lastCompletedAt: null },
      { userId: 'b', nickname: 'Bob', avatar: '', completedDays: 7, lastCompletedAt: null },
      { userId: 'c', nickname: 'Carol', avatar: '', completedDays: 5, lastCompletedAt: null },
    ];
    const ranked = rankLeaderboard(entries);
    expect(ranked[0].userId).toBe('b');
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].userId).toBe('c');
    expect(ranked[1].rank).toBe(2);
    expect(ranked[2].userId).toBe('a');
    expect(ranked[2].rank).toBe(3);
  });

  it('breaks ties by earlier last completed time', () => {
    const entries: LeaderboardEntryInput[] = [
      { userId: 'a', nickname: 'Alice', avatar: '', completedDays: 5, lastCompletedAt: new Date('2025-03-10T20:00:00') },
      { userId: 'b', nickname: 'Bob', avatar: '', completedDays: 5, lastCompletedAt: new Date('2025-03-10T18:00:00') },
    ];
    const ranked = rankLeaderboard(entries);
    expect(ranked[0].userId).toBe('b'); // Bob finished earlier
    expect(ranked[1].userId).toBe('a');
  });

  it('null lastCompletedAt sorts after non-null with same days', () => {
    const entries: LeaderboardEntryInput[] = [
      { userId: 'a', nickname: 'Alice', avatar: '', completedDays: 3, lastCompletedAt: null },
      { userId: 'b', nickname: 'Bob', avatar: '', completedDays: 3, lastCompletedAt: new Date('2025-03-10T12:00:00') },
    ];
    const ranked = rankLeaderboard(entries);
    expect(ranked[0].userId).toBe('b');
    expect(ranked[1].userId).toBe('a');
  });

  it('returns empty array for empty input', () => {
    expect(rankLeaderboard([])).toEqual([]);
  });

  it('assigns sequential ranks starting from 1', () => {
    const entries: LeaderboardEntryInput[] = [
      { userId: 'a', nickname: 'A', avatar: '', completedDays: 7, lastCompletedAt: null },
      { userId: 'b', nickname: 'B', avatar: '', completedDays: 5, lastCompletedAt: null },
      { userId: 'c', nickname: 'C', avatar: '', completedDays: 3, lastCompletedAt: null },
    ];
    const ranked = rankLeaderboard(entries);
    expect(ranked.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('does not mutate the original array', () => {
    const entries: LeaderboardEntryInput[] = [
      { userId: 'a', nickname: 'A', avatar: '', completedDays: 1, lastCompletedAt: null },
      { userId: 'b', nickname: 'B', avatar: '', completedDays: 7, lastCompletedAt: null },
    ];
    const original = [...entries];
    rankLeaderboard(entries);
    expect(entries[0].userId).toBe(original[0].userId);
    expect(entries[1].userId).toBe(original[1].userId);
  });

  it('handles single entry', () => {
    const entries: LeaderboardEntryInput[] = [
      { userId: 'a', nickname: 'Solo', avatar: '', completedDays: 4, lastCompletedAt: null },
    ];
    const ranked = rankLeaderboard(entries);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].rank).toBe(1);
  });
});

describe('maskNickname', () => {
  it('masks middle characters for names with 3+ chars', () => {
    expect(maskNickname('张三丰')).toBe('张*丰');
    expect(maskNickname('Alice')).toBe('A***e');
  });

  it('masks single char name with asterisks', () => {
    expect(maskNickname('张')).toBe('张**');
  });

  it('masks two char name', () => {
    expect(maskNickname('张三')).toBe('张*');
  });

  it('returns asterisks for empty string', () => {
    expect(maskNickname('')).toBe('***');
  });
});

'use server';

import { createClient } from '@/lib/supabase/server';
import { joinChallengeSchema } from '@/lib/validations/challenge';
import {
  canUserJoinChallenge,
  buildNewChallenge,
  canRefundChallenge,
  isDailyTaskComplete,
  isWithinDailyDeadline,
  isInSettlementWindow,
  settleDailyTask,
  shouldSendTaskReminder,
  isTaskReminderTime,
  isPerfectAttendance,
  distributeRewardPool,
  calculateRewardPoolTotal,
  rankLeaderboard,
  maskNickname,
  CHALLENGE_DEPOSIT,
} from '@/lib/utils/challenge';
import type { Challenge, DailyTask, ChallengeStatus } from '@/types';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// --- Mappers ---

function mapChallenge(
  row: Record<string, unknown>,
  taskRows: Record<string, unknown>[] = [],
): Challenge {
  const dailyTasks: DailyTask[] = taskRows.map((t) => ({
    id: t.id as string,
    challengeId: t.challenge_id as string,
    day: Number(t.day),
    taskDate: new Date(t.task_date as string),
    completed: Boolean(t.completed),
    reward: Number(t.reward),
    mealRecorded: Boolean(t.meal_recorded),
    calorieTargetMet: Boolean(t.calorie_target_met),
    exerciseTargetMet: t.exercise_target_met == null ? null : Boolean(t.exercise_target_met),
    checkedAt: t.checked_at ? new Date(t.checked_at as string) : null,
    createdAt: new Date(t.created_at as string),
  }));

  return {
    id: row.id as string,
    userId: row.user_id as string,
    startDate: new Date(row.start_date as string),
    endDate: new Date(row.end_date as string),
    deposit: Number(row.deposit),
    totalReward: Number(row.total_reward ?? 0),
    rewardPool: Number(row.reward_pool ?? 0),
    status: row.status as ChallengeStatus,
    dailyTasks,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/**
 * Join a new challenge by paying the deposit.
 * Requirement 9.1: User pays 100 元 deposit
 * Requirement 9.2: Creates 7-day challenge starting from payment day 00:00
 * Requirement 9.5: Block if user already has active/pending challenge
 * Requirement 9.8: Lock deposit when challenge starts
 */
export async function joinChallenge(
  input: unknown,
): Promise<ActionResult<Challenge>> {
  // Validate input
  const parsed = joinChallengeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { deposit } = parsed.data;

  if (deposit !== CHALLENGE_DEPOSIT) {
    return { success: false, error: `押金必须为 ${CHALLENGE_DEPOSIT} 元` };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // Check uniqueness constraint: no active/pending challenges
    const { data: existingChallenges } = await supabase
      .from('challenges')
      .select('status')
      .eq('user_id', user.id)
      .in('status', ['active', 'pending']);

    const existingStatuses = (existingChallenges ?? []).map(
      (c) => c.status as ChallengeStatus,
    );

    const joinCheck = canUserJoinChallenge(existingStatuses);
    if (!joinCheck.canJoin) {
      return { success: false, error: joinCheck.reason };
    }

    // Build challenge data
    const now = new Date();
    const challengeData = buildNewChallenge(now);

    // Insert challenge
    const { data: challengeRow, error: challengeError } = await supabase
      .from('challenges')
      .insert({
        user_id: user.id,
        start_date: challengeData.startDate.toISOString().split('T')[0],
        end_date: challengeData.endDate.toISOString().split('T')[0],
        deposit: challengeData.deposit,
        status: 'pending',
        total_reward: 0,
        reward_pool: 0,
      })
      .select()
      .single();

    if (challengeError || !challengeRow) {
      // Could be unique constraint violation
      if (challengeError?.code === '23505') {
        return { success: false, error: '您已有进行中的挑战' };
      }
      return { success: false, error: '创建挑战失败，请重试' };
    }

    // Insert daily tasks
    const taskInserts = challengeData.dailyTasks.map((task) => ({
      challenge_id: challengeRow.id,
      day: task.day,
      task_date: task.taskDate.toISOString().split('T')[0],
      reward: task.reward,
      completed: false,
      meal_recorded: false,
      calorie_target_met: false,
    }));

    const { data: taskRows, error: taskError } = await supabase
      .from('daily_tasks')
      .insert(taskInserts)
      .select();

    if (taskError) {
      // Rollback challenge
      await supabase.from('challenges').delete().eq('id', challengeRow.id);
      return { success: false, error: '创建每日任务失败，请重试' };
    }

    return {
      success: true,
      data: mapChallenge(challengeRow, taskRows ?? []),
    };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Cancel a pending challenge and get a full refund.
 * Requirement 9.6: No refund after challenge starts
 * Requirement 9.7: Full refund before challenge starts
 */
export async function cancelChallenge(
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

    const now = new Date();
    const refundResult = canRefundChallenge(
      challenge.status as ChallengeStatus,
      new Date(challenge.start_date as string),
      now,
    );

    if (!refundResult.canRefund) {
      return { success: false, error: refundResult.reason };
    }

    // Update challenge status to failed (cancelled)
    const { error: updateError } = await supabase
      .from('challenges')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', challengeId);

    if (updateError) {
      return { success: false, error: '取消挑战失败，请重试' };
    }

    return {
      success: true,
      data: { refundAmount: refundResult.refundAmount },
    };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Check and update a daily task's completion status.
 * Requirement 10.1: Daily task deadline is 23:30
 * Requirement 10.8: Must complete meals + calorie within ±10%
 */
export async function checkDailyTask(
  challengeId: string,
  day: number,
): Promise<ActionResult<DailyTask>> {
  if (!challengeId || day < 1 || day > 7) {
    return { success: false, error: '参数无效' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const now = new Date();

    // Check deadline
    if (!isWithinDailyDeadline(now)) {
      return { success: false, error: '已超过每日任务截止时间（23:30）' };
    }

    // Fetch challenge and verify ownership
    const { data: challenge } = await supabase
      .from('challenges')
      .select('*')
      .eq('id', challengeId)
      .eq('user_id', user.id)
      .single();

    if (!challenge) {
      return { success: false, error: '挑战不存在或无权操作' };
    }

    if (challenge.status !== 'active') {
      return { success: false, error: '挑战未在进行中' };
    }

    // Fetch the daily task
    const { data: task } = await supabase
      .from('daily_tasks')
      .select('*')
      .eq('challenge_id', challengeId)
      .eq('day', day)
      .single();

    if (!task) {
      return { success: false, error: '每日任务不存在' };
    }

    // Get user's calorie target
    const { data: userProfile } = await supabase
      .from('users')
      .select('daily_calorie_target')
      .eq('id', user.id)
      .single();

    const targetCalories = Number(userProfile?.daily_calorie_target ?? 2000);

    // Get meal records for the task date
    const taskDate = new Date(task.task_date as string);
    const startOfDay = new Date(taskDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(taskDate);
    endOfDay.setHours(23, 59, 59, 999);

    const { data: meals } = await supabase
      .from('meal_records')
      .select('total_calories, meal_type')
      .eq('user_id', user.id)
      .gte('recorded_at', startOfDay.toISOString())
      .lte('recorded_at', endOfDay.toISOString());

    const mealRecords = meals ?? [];
    const mealRecorded = mealRecords.length >= 3;
    const totalCalories = mealRecords.reduce(
      (sum, m) => sum + Number(m.total_calories),
      0,
    );

    const completed = isDailyTaskComplete(mealRecorded, totalCalories, targetCalories);
    const calorieTargetMet = targetCalories > 0
      ? Math.abs(totalCalories - targetCalories) / targetCalories <= 0.1
      : false;

    // Update the daily task
    const { data: updatedTask, error: updateError } = await supabase
      .from('daily_tasks')
      .update({
        completed,
        meal_recorded: mealRecorded,
        calorie_target_met: calorieTargetMet,
        checked_at: now.toISOString(),
      })
      .eq('id', task.id)
      .select()
      .single();

    if (updateError || !updatedTask) {
      return { success: false, error: '更新任务状态失败' };
    }

    const mappedTask: DailyTask = {
      id: updatedTask.id as string,
      challengeId: updatedTask.challenge_id as string,
      day: Number(updatedTask.day),
      taskDate: new Date(updatedTask.task_date as string),
      completed: Boolean(updatedTask.completed),
      reward: Number(updatedTask.reward),
      mealRecorded: Boolean(updatedTask.meal_recorded),
      calorieTargetMet: Boolean(updatedTask.calorie_target_met),
      exerciseTargetMet: updatedTask.exercise_target_met == null
        ? null
        : Boolean(updatedTask.exercise_target_met),
      checkedAt: updatedTask.checked_at
        ? new Date(updatedTask.checked_at as string)
        : null,
      createdAt: new Date(updatedTask.created_at as string),
    };

    return { success: true, data: mappedTask };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Get the current user's active or pending challenge.
 */
export async function getActiveChallenge(): Promise<ActionResult<Challenge | null>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { data: challengeRow } = await supabase
      .from('challenges')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!challengeRow) {
      return { success: true, data: null };
    }

    // Fetch daily tasks
    const { data: taskRows } = await supabase
      .from('daily_tasks')
      .select('*')
      .eq('challenge_id', challengeRow.id)
      .order('day', { ascending: true });

    return {
      success: true,
      data: mapChallenge(challengeRow, taskRows ?? []),
    };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Settle a daily task at deadline (23:30-23:59).
 * Completed → cashback to user, Uncompleted → amount to reward pool.
 * Requirement 10.3: Auto-settlement between 23:30 and 23:59
 * Requirement 10.6: Cashback for completed tasks
 * Requirement 10.7: Uncompleted task amount goes to reward pool
 */
export async function settleDailyTaskAction(
  challengeId: string,
  day: number,
): Promise<ActionResult<{ cashback: number; rewardPool: number }>> {
  if (!challengeId || day < 1 || day > 7) {
    return { success: false, error: '参数无效' };
  }

  try {
    const supabase = await createClient();

    // Fetch challenge
    const { data: challenge } = await supabase
      .from('challenges')
      .select('*')
      .eq('id', challengeId)
      .single();

    if (!challenge) {
      return { success: false, error: '挑战不存在' };
    }

    if (challenge.status !== 'active') {
      return { success: false, error: '挑战未在进行中' };
    }

    // Fetch the daily task
    const { data: task } = await supabase
      .from('daily_tasks')
      .select('*')
      .eq('challenge_id', challengeId)
      .eq('day', day)
      .single();

    if (!task) {
      return { success: false, error: '每日任务不存在' };
    }

    const settlement = settleDailyTask({
      day: Number(task.day),
      completed: Boolean(task.completed),
      reward: Number(task.reward),
    });

    // Update challenge totals
    const currentTotalReward = Number(challenge.total_reward ?? 0);
    const currentRewardPool = Number(challenge.reward_pool ?? 0);

    const { error: updateError } = await supabase
      .from('challenges')
      .update({
        total_reward: currentTotalReward + settlement.cashbackAmount,
        reward_pool: currentRewardPool + settlement.rewardPoolAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', challengeId);

    if (updateError) {
      return { success: false, error: '结算失败，请重试' };
    }

    // If cashback > 0, create a reward transaction
    if (settlement.cashbackAmount > 0) {
      await supabase.from('reward_transactions').insert({
        user_id: challenge.user_id,
        challenge_id: challengeId,
        type: 'daily_reward',
        amount: settlement.cashbackAmount,
        balance_after: currentTotalReward + settlement.cashbackAmount,
        status: 'completed',
      });
    }

    return {
      success: true,
      data: {
        cashback: settlement.cashbackAmount,
        rewardPool: settlement.rewardPoolAmount,
      },
    };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Check if task reminders should be sent and return users who need reminders.
 * Requirement 10.9: Send task reminder at 22:00 to users who haven't completed.
 */
export async function checkTaskReminders(): Promise<
  ActionResult<{ userIds: string[]; message: string }>
> {
  try {
    const now = new Date();

    if (!isTaskReminderTime(now)) {
      return {
        success: true,
        data: { userIds: [], message: '当前不在提醒时间窗口' },
      };
    }

    const supabase = await createClient();

    // Get today's date string
    const todayStr = now.toISOString().split('T')[0];

    // Find active challenges with uncompleted tasks for today
    const { data: uncompletedTasks } = await supabase
      .from('daily_tasks')
      .select('challenge_id, challenges!inner(user_id, status)')
      .eq('task_date', todayStr)
      .eq('completed', false)
      .eq('challenges.status', 'active');

    if (!uncompletedTasks || uncompletedTasks.length === 0) {
      return {
        success: true,
        data: { userIds: [], message: '所有用户已完成今日任务' },
      };
    }

    const userIds = uncompletedTasks
      .map((t) => {
        const challenges = t.challenges as unknown as { user_id: string; status: string };
        return challenges.user_id;
      })
      .filter((id, index, arr) => arr.indexOf(id) === index);

    // Filter using pure logic
    const usersToNotify = userIds.filter(() =>
      shouldSendTaskReminder(true, false),
    );

    return {
      success: true,
      data: {
        userIds: usersToNotify,
        message: `需要提醒 ${usersToNotify.length} 位用户完成今日任务`,
      },
    };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Run auto-settlement for all active challenges at deadline (23:30-23:59).
 * Requirement 10.3: Auto-settlement between 23:30 and 23:59
 */
export async function runDailySettlement(): Promise<
  ActionResult<{ settled: number; cashbackTotal: number; rewardPoolTotal: number }>
> {
  try {
    const now = new Date();

    if (!isInSettlementWindow(now)) {
      return {
        success: false,
        error: '当前不在结算时间窗口（23:30-23:59）',
      };
    }

    const supabase = await createClient();
    const todayStr = now.toISOString().split('T')[0];

    // Find all unsettled daily tasks for today across active challenges
    const { data: tasks } = await supabase
      .from('daily_tasks')
      .select('*, challenges!inner(id, user_id, status, total_reward, reward_pool)')
      .eq('task_date', todayStr)
      .eq('challenges.status', 'active');

    if (!tasks || tasks.length === 0) {
      return {
        success: true,
        data: { settled: 0, cashbackTotal: 0, rewardPoolTotal: 0 },
      };
    }

    let settledCount = 0;
    let cashbackTotal = 0;
    let rewardPoolTotal = 0;

    for (const task of tasks) {
      const settlement = settleDailyTask({
        day: Number(task.day),
        completed: Boolean(task.completed),
        reward: Number(task.reward),
      });

      const challenges = task.challenges as unknown as {
        id: string;
        user_id: string;
        total_reward: number;
        reward_pool: number;
      };

      const currentTotalReward = Number(challenges.total_reward ?? 0);
      const currentRewardPool = Number(challenges.reward_pool ?? 0);

      await supabase
        .from('challenges')
        .update({
          total_reward: currentTotalReward + settlement.cashbackAmount,
          reward_pool: currentRewardPool + settlement.rewardPoolAmount,
          updated_at: now.toISOString(),
        })
        .eq('id', challenges.id);

      if (settlement.cashbackAmount > 0) {
        await supabase.from('reward_transactions').insert({
          user_id: challenges.user_id,
          challenge_id: challenges.id,
          type: 'daily_reward',
          amount: settlement.cashbackAmount,
          balance_after: currentTotalReward + settlement.cashbackAmount,
          status: 'completed',
        });
      }

      cashbackTotal += settlement.cashbackAmount;
      rewardPoolTotal += settlement.rewardPoolAmount;
      settledCount++;
    }

    return {
      success: true,
      data: { settled: settledCount, cashbackTotal, rewardPoolTotal },
    };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}


/**
 * Calculate the reward pool for a completed challenge period.
 * Requirement 11.1: Reward pool = sum of all uncompleted day amounts.
 *
 * This aggregates across ALL challenges in the same period (same start_date).
 */
export async function calculateRewardPool(
  challengeId: string,
): Promise<ActionResult<{ totalPool: number; perfectAttendanceUserIds: string[] }>> {
  if (!challengeId) {
    return { success: false, error: '挑战 ID 不能为空' };
  }

  try {
    const supabase = await createClient();

    // Fetch the reference challenge to get the period dates
    const { data: refChallenge } = await supabase
      .from('challenges')
      .select('*')
      .eq('id', challengeId)
      .single();

    if (!refChallenge) {
      return { success: false, error: '挑战不存在' };
    }

    // Find all challenges in the same period (same start_date)
    const { data: periodChallenges } = await supabase
      .from('challenges')
      .select('id, user_id, status, reward_pool')
      .eq('start_date', refChallenge.start_date)
      .in('status', ['completed', 'active']);

    if (!periodChallenges || periodChallenges.length === 0) {
      return { success: true, data: { totalPool: 0, perfectAttendanceUserIds: [] } };
    }

    // For each challenge, fetch daily tasks and determine completion
    const participantCompletions: boolean[][] = [];
    const perfectAttendanceUserIds: string[] = [];

    for (const ch of periodChallenges) {
      const { data: tasks } = await supabase
        .from('daily_tasks')
        .select('day, completed')
        .eq('challenge_id', ch.id)
        .order('day', { ascending: true });

      const completedDays = Array.from({ length: 7 }, (_, i) => {
        const task = (tasks ?? []).find((t) => Number(t.day) === i + 1);
        return task ? Boolean(task.completed) : false;
      });

      participantCompletions.push(completedDays);

      if (isPerfectAttendance(completedDays)) {
        perfectAttendanceUserIds.push(ch.user_id as string);
      }
    }

    const totalPool = calculateRewardPoolTotal(participantCompletions);

    return {
      success: true,
      data: { totalPool, perfectAttendanceUserIds },
    };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Distribute rewards from the reward pool to perfect attendance users.
 * Requirement 11.2: Deduct 15% platform commission.
 * Requirement 11.3: Distribute remaining 85% equally to perfect attendance users.
 * Requirement 11.5: Per-user bonus capped at deposit × 2.
 * Requirement 11.6: If no perfect attendance users, carry over to next period.
 * Requirement 11.7: Complete distribution within 24 hours of challenge end.
 */
export async function distributeRewards(
  challengeId: string,
): Promise<ActionResult<{
  totalPool: number;
  platformCommission: number;
  perUserBonus: number;
  recipientCount: number;
  carryOver: number;
}>> {
  if (!challengeId) {
    return { success: false, error: '挑战 ID 不能为空' };
  }

  try {
    const supabase = await createClient();

    // First calculate the reward pool
    const poolResult = await calculateRewardPool(challengeId);
    if (!poolResult.success || !poolResult.data) {
      return { success: false, error: poolResult.error ?? '计算奖金池失败' };
    }

    const { totalPool, perfectAttendanceUserIds } = poolResult.data;

    if (totalPool <= 0) {
      return {
        success: true,
        data: {
          totalPool: 0,
          platformCommission: 0,
          perUserBonus: 0,
          recipientCount: 0,
          carryOver: 0,
        },
      };
    }

    // Use pure function to calculate distribution
    const distribution = distributeRewardPool({
      totalPool,
      perfectAttendanceCount: perfectAttendanceUserIds.length,
      depositPerUser: CHALLENGE_DEPOSIT,
    });

    // Create reward transactions for each perfect attendance user
    if (distribution.perUserBonus > 0 && perfectAttendanceUserIds.length > 0) {
      for (const userId of perfectAttendanceUserIds) {
        // Get current user balance
        const { data: latestTx } = await supabase
          .from('reward_transactions')
          .select('balance_after')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const currentBalance = Number(latestTx?.balance_after ?? 0);

        await supabase.from('reward_transactions').insert({
          user_id: userId,
          challenge_id: challengeId,
          type: 'pool_bonus',
          amount: distribution.perUserBonus,
          balance_after: currentBalance + distribution.perUserBonus,
          status: 'completed',
          processed_at: new Date().toISOString(),
        });
      }
    }

    // If there's carry-over, store it for the next period
    // (In practice this would be stored in a separate table or config;
    //  for now we update the challenge's reward_pool field as a record)
    if (distribution.carryOver > 0) {
      const { data: refChallenge } = await supabase
        .from('challenges')
        .select('start_date')
        .eq('id', challengeId)
        .single();

      if (refChallenge) {
        // Update all challenges in this period to mark distribution complete
        await supabase
          .from('challenges')
          .update({
            reward_pool: distribution.carryOver,
            updated_at: new Date().toISOString(),
          })
          .eq('start_date', refChallenge.start_date)
          .in('status', ['completed', 'active']);
      }
    }

    return {
      success: true,
      data: {
        totalPool: distribution.totalPool,
        platformCommission: distribution.platformCommission,
        perUserBonus: distribution.perUserBonus,
        recipientCount: distribution.recipientCount,
        carryOver: distribution.carryOver,
      },
    };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}


/**
 * Get the leaderboard for the current active challenge period.
 * Requirement 12.1: Show all participants' progress for the current period.
 * Requirement 12.2: Sort by completed days and completion time.
 * Requirement 12.3: Display rank, nickname, completed days.
 * Requirement 12.4: Protect privacy — only nickname and avatar.
 * Requirement 12.5: Real-time leaderboard data.
 */
export async function getLeaderboard(): Promise<
  ActionResult<{
    entries: Array<{
      rank: number;
      userId: string;
      nickname: string;
      avatar: string;
      completedDays: number;
      lastCompletedAt: string | null;
    }>;
    totalParticipants: number;
  }>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // Find the current active period: get challenges that are active or recently completed
    const { data: activeChallenges } = await supabase
      .from('challenges')
      .select('start_date')
      .in('status', ['active', 'pending'])
      .order('start_date', { ascending: false })
      .limit(1);

    let periodStartDate: string | null = null;

    if (activeChallenges && activeChallenges.length > 0) {
      periodStartDate = activeChallenges[0].start_date as string;
    } else {
      // Fallback: get the most recent completed challenge period
      const { data: recentChallenges } = await supabase
        .from('challenges')
        .select('start_date')
        .eq('status', 'completed')
        .order('start_date', { ascending: false })
        .limit(1);

      if (recentChallenges && recentChallenges.length > 0) {
        periodStartDate = recentChallenges[0].start_date as string;
      }
    }

    if (!periodStartDate) {
      return {
        success: true,
        data: { entries: [], totalParticipants: 0 },
      };
    }

    // Get all challenges in this period with user info
    const { data: periodChallenges } = await supabase
      .from('challenges')
      .select('id, user_id, users!inner(nickname, avatar)')
      .eq('start_date', periodStartDate)
      .in('status', ['active', 'pending', 'completed']);

    if (!periodChallenges || periodChallenges.length === 0) {
      return {
        success: true,
        data: { entries: [], totalParticipants: 0 },
      };
    }

    // For each challenge, get daily task completion info
    const challengeIds = periodChallenges.map((c) => c.id as string);

    const { data: allTasks } = await supabase
      .from('daily_tasks')
      .select('challenge_id, completed, checked_at')
      .in('challenge_id', challengeIds);

    // Build leaderboard input entries
    const entriesInput: import('@/lib/utils/challenge').LeaderboardEntryInput[] =
      periodChallenges.map((ch) => {
        const userInfo = ch.users as unknown as {
          nickname: string;
          avatar: string;
        };
        const tasks = (allTasks ?? []).filter(
          (t) => t.challenge_id === ch.id,
        );
        const completedTasks = tasks.filter((t) => Boolean(t.completed));
        const completedDays = completedTasks.length;

        // Find the latest checked_at among completed tasks
        let lastCompletedAt: Date | null = null;
        for (const t of completedTasks) {
          if (t.checked_at) {
            const d = new Date(t.checked_at as string);
            if (!lastCompletedAt || d > lastCompletedAt) {
              lastCompletedAt = d;
            }
          }
        }

        return {
          userId: ch.user_id as string,
          nickname: maskNickname(userInfo.nickname ?? '用户'),
          avatar: userInfo.avatar ?? '',
          completedDays,
          lastCompletedAt,
        };
      });

    const ranked = rankLeaderboard(entriesInput);

    return {
      success: true,
      data: {
        entries: ranked.map((e) => ({
          rank: e.rank,
          userId: e.userId,
          nickname: e.nickname,
          avatar: e.avatar,
          completedDays: e.completedDays,
          lastCompletedAt: e.lastCompletedAt?.toISOString() ?? null,
        })),
        totalParticipants: ranked.length,
      },
    };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

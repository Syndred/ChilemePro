import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canUserJoinChallenge, buildNewChallenge } from '@/lib/utils/challenge';
import {
  buildWechatPayOrder,
  calculateMembershipExpiry,
  getMembershipTierFromAmount,
} from '@/lib/utils/payment';
import type { PaymentTransactionType } from '@/types';

function isMockWechatPayMode(): boolean {
  return !process.env.WECHAT_PAY_API_KEY && process.env.NODE_ENV !== 'production';
}

async function createActiveChallenge(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ challengeId?: string; error?: string }> {
  const { data: existingChallenges } = await supabase
    .from('challenges')
    .select('status')
    .eq('user_id', userId)
    .in('status', ['active', 'pending']);

  const existingStatuses = (existingChallenges ?? []).map(
    (item) => item.status as 'active' | 'pending',
  );
  const joinCheck = canUserJoinChallenge(existingStatuses);
  if (!joinCheck.canJoin) {
    return { error: joinCheck.reason ?? '当前已有进行中的挑战' };
  }

  const challengeData = buildNewChallenge(new Date());
  const { data: challengeRow, error: challengeError } = await supabase
    .from('challenges')
    .insert({
      user_id: userId,
      start_date: challengeData.startDate.toISOString().split('T')[0],
      end_date: challengeData.endDate.toISOString().split('T')[0],
      deposit: challengeData.deposit,
      status: 'active',
      total_reward: 0,
      reward_pool: 0,
    })
    .select('id')
    .single();

  if (challengeError || !challengeRow) {
    return { error: '创建挑战失败，请稍后重试' };
  }

  const taskInserts = challengeData.dailyTasks.map((task) => ({
    challenge_id: challengeRow.id,
    day: task.day,
    task_date: task.taskDate.toISOString().split('T')[0],
    reward: task.reward,
    completed: false,
    meal_recorded: false,
    calorie_target_met: false,
  }));

  const { error: taskError } = await supabase.from('daily_tasks').insert(taskInserts);
  if (taskError) {
    await supabase.from('challenges').delete().eq('id', challengeRow.id);
    return { error: '创建挑战任务失败，请稍后重试' };
  }

  return { challengeId: challengeRow.id as string };
}

async function activateMembership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  amount: number,
): Promise<void> {
  const tier = getMembershipTierFromAmount(amount);
  if (!tier) {
    return;
  }

  const { data: userData } = await supabase
    .from('users')
    .select('membership_expires_at')
    .eq('id', userId)
    .single();

  const currentExpiry = userData?.membership_expires_at
    ? new Date(userData.membership_expires_at as string)
    : null;
  const newExpiry = calculateMembershipExpiry(currentExpiry, tier);

  await supabase
    .from('users')
    .update({
      membership_tier: tier,
      membership_expires_at: newExpiry.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
}

/**
 * POST /api/payment/wechat
 * - Development: when WECHAT_PAY_API_KEY is missing, create a mock-completed transaction.
 * - Production: create a pending transaction and return order payload for client handoff.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const { type, amount, challengeId, openId } = body as {
      type: PaymentTransactionType;
      amount: number;
      challengeId?: string;
      openId?: string;
    };

    if (!type || !amount) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
    const order = buildWechatPayOrder({
      type,
      amount,
      userId: user.id,
      challengeId,
      openId: openId ?? `debug_${user.id}`,
      clientIp,
    });

    if (!order.valid) {
      return NextResponse.json({ error: order.error ?? '参数校验失败' }, { status: 400 });
    }

    if (isMockWechatPayMode()) {
      let resolvedChallengeId = challengeId ?? null;

      if (type === 'deposit' && !resolvedChallengeId) {
        const challengeResult = await createActiveChallenge(supabase, user.id);
        if (!challengeResult.challengeId) {
          return NextResponse.json(
            { error: challengeResult.error ?? '创建挑战失败' },
            { status: 400 },
          );
        }
        resolvedChallengeId = challengeResult.challengeId;
      } else if (type === 'deposit' && resolvedChallengeId) {
        await supabase
          .from('challenges')
          .update({
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('id', resolvedChallengeId)
          .eq('user_id', user.id);
      }

      if (type === 'membership') {
        await activateMembership(supabase, user.id, amount);
      }

      await supabase.from('payment_transactions').insert({
        user_id: user.id,
        challenge_id: resolvedChallengeId,
        type,
        amount,
        payment_method: 'wechat',
        payment_provider: 'wechat',
        transaction_id: order.outTradeNo,
        status: 'completed',
      });

      return NextResponse.json({
        paymentIntentId: order.outTradeNo,
        status: 'completed',
        mock: true,
        provider: 'wechat',
        challengeId: resolvedChallengeId,
      });
    }

    await supabase.from('payment_transactions').insert({
      user_id: user.id,
      challenge_id: challengeId ?? null,
      type,
      amount,
      payment_method: 'wechat',
      payment_provider: 'wechat',
      transaction_id: order.outTradeNo,
      status: 'pending',
    });

    return NextResponse.json({
      paymentIntentId: order.outTradeNo,
      status: 'pending',
      provider: 'wechat',
      order: {
        outTradeNo: order.outTradeNo,
        totalFee: order.totalFee,
        body: order.body,
      },
    });
  } catch (error) {
    console.error('WeChat payment create error:', error);
    return NextResponse.json({ error: '微信支付创建失败，请重试' }, { status: 500 });
  }
}

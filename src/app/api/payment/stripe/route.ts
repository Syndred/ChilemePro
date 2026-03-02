import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import {
  buildPaymentIntent,
  getMembershipTierFromAmount,
  calculateMembershipExpiry,
  getPaymentDescription,
  STRIPE_CURRENCY,
} from '@/lib/utils/payment';
import { canUserJoinChallenge, buildNewChallenge } from '@/lib/utils/challenge';
import type { PaymentTransactionType } from '@/types';

function getStripeClient(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-02-25.clover',
  });
}

function isMockStripeMode(): boolean {
  return !process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV !== 'production';
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
    return { error: joinCheck.reason ?? '褰撳墠宸叉湁杩涜涓殑鎸戞垬' };
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
    return { error: '鍒涘缓鎸戞垬澶辫触锛岃绋嶅悗閲嶈瘯' };
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
    return { error: '鍒涘缓鎸戞垬浠诲姟澶辫触锛岃绋嶅悗閲嶈瘯' };
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
 * POST /api/payment/stripe
 * Create a Stripe PaymentIntent for deposit or membership payment.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '璇峰厛鐧诲綍' }, { status: 401 });
    }

    const body = await request.json();
    const { type, amount, challengeId } = body as {
      type: PaymentTransactionType;
      amount: number;
      challengeId?: string;
    };

    if (!type || !amount) {
      return NextResponse.json({ error: '缂哄皯蹇呰鍙傛暟' }, { status: 400 });
    }

    const intentInput = buildPaymentIntent({
      type,
      amount,
      userId: user.id,
      challengeId,
    });

    if (!intentInput.valid) {
      return NextResponse.json({ error: intentInput.error }, { status: 400 });
    }

    // Development fallback: no Stripe key means "mock completed" transaction.
    if (isMockStripeMode()) {
      const transactionId = `mock_${randomUUID()}`;
      let resolvedChallengeId = challengeId ?? null;

      if (type === 'deposit' && !resolvedChallengeId) {
        const challengeResult = await createActiveChallenge(supabase, user.id);
        if (!challengeResult.challengeId) {
          return NextResponse.json(
            { error: challengeResult.error ?? '鍒涘缓鎸戞垬澶辫触' },
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
        payment_method: 'stripe',
        payment_provider: 'stripe',
        transaction_id: transactionId,
        status: 'completed',
      });

      return NextResponse.json({
        paymentIntentId: transactionId,
        status: 'completed',
        mock: true,
        challengeId: resolvedChallengeId,
      });
    }

    const stripe = getStripeClient();
    const description = getPaymentDescription(type, amount);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: intentInput.amountInCents,
      currency: STRIPE_CURRENCY,
      metadata: intentInput.metadata,
      description,
      automatic_payment_methods: { enabled: true },
    });

    await supabase.from('payment_transactions').insert({
      user_id: user.id,
      challenge_id: challengeId ?? null,
      type,
      amount,
      payment_method: 'stripe',
      payment_provider: 'stripe',
      transaction_id: paymentIntent.id,
      status: 'pending',
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      status: 'pending',
    });
  } catch (error) {
    console.error('Stripe payment error:', error);
    return NextResponse.json(
      { error: '鏀粯鍒涘缓澶辫触锛岃閲嶈瘯' },
      { status: 500 },
    );
  }
}


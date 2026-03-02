import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import {
  mapStripeStatus,
  fromStripeAmount,
  mapWechatTradeState,
  mapAlipayTradeStatus,
  verifyWechatSignature,
  verifyAlipaySignature,
  getMembershipTierFromAmount,
  calculateMembershipExpiry,
} from '@/lib/utils/payment';
import { canUserJoinChallenge, buildNewChallenge } from '@/lib/utils/challenge';

function getStripeWebhookConfig(): { stripe: Stripe; webhookSecret: string } {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY');
  }
  if (!webhookSecret) {
    throw new Error('Missing STRIPE_WEBHOOK_SECRET');
  }

  return {
    stripe: new Stripe(secretKey, { apiVersion: '2026-02-25.clover' }),
    webhookSecret,
  };
}

async function createActiveChallengeForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
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
    return null;
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
    return null;
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
    return null;
  }

  return challengeRow.id as string;
}

async function applyMembershipUpgrade(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  amount: number,
) {
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
 * POST /api/webhooks
 * Routes provider webhooks:
 * - Stripe: default
 * - WeChat: /api/webhooks?provider=wechat
 * - Alipay: /api/webhooks?provider=alipay
 */
export async function POST(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get('provider');

  if (provider === 'wechat') {
    return handleWechatCallback(request);
  }
  if (provider === 'alipay') {
    return handleAlipayCallback(request);
  }
  return handleStripeWebhook(request);
}

async function handleStripeWebhook(request: NextRequest) {
  let stripe: Stripe;
  let webhookSecret: string;

  try {
    ({ stripe, webhookSecret } = getStripeWebhookConfig());
  } catch (error) {
    console.error('Stripe webhook config error:', error);
    return NextResponse.json(
      { error: 'Stripe webhook config invalid' },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error('Stripe signature verify failed:', error);
    return NextResponse.json(
      { error: 'Stripe signature verification failed' },
      { status: 400 },
    );
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      await handlePaymentSuccess(event.data.object as Stripe.PaymentIntent);
    } else if (event.type === 'payment_intent.payment_failed') {
      await handlePaymentFailure(event.data.object as Stripe.PaymentIntent);
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  const supabase = await createClient();
  const status = mapStripeStatus(paymentIntent.status);

  await supabase
    .from('payment_transactions')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('transaction_id', paymentIntent.id);

  const userId = paymentIntent.metadata.userId;
  const type = paymentIntent.metadata.type;
  const challengeId = paymentIntent.metadata.challengeId || null;

  if (!userId || !type) {
    return;
  }

  await applyPostPaymentSuccess(
    supabase,
    userId,
    type,
    challengeId,
    fromStripeAmount(paymentIntent.amount),
    paymentIntent.id,
  );
}

async function handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
  const supabase = await createClient();
  const status = mapStripeStatus(paymentIntent.status);

  await supabase
    .from('payment_transactions')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('transaction_id', paymentIntent.id);
}

async function handleWechatCallback(request: NextRequest) {
  try {
    const xmlBody = await request.text();
    const params = parseWechatXml(xmlBody);

    const apiKey = process.env.WECHAT_PAY_API_KEY!;
    if (!verifyWechatSignature(params, apiKey)) {
      return new NextResponse(
        buildWechatXmlResponse('FAIL', '绛惧悕楠岃瘉澶辫触'),
        { status: 400, headers: { 'Content-Type': 'application/xml' } },
      );
    }

    if (params.return_code !== 'SUCCESS' || params.result_code !== 'SUCCESS') {
      return new NextResponse(buildWechatXmlResponse('SUCCESS', 'OK'), {
        headers: { 'Content-Type': 'application/xml' },
      });
    }

    const supabase = await createClient();
    const transactionId = params.out_trade_no;
    const status = mapWechatTradeState(params.result_code);

    const { data: txn } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('transaction_id', transactionId)
      .single();

    if (!txn) {
      return new NextResponse(buildWechatXmlResponse('SUCCESS', 'OK'), {
        headers: { 'Content-Type': 'application/xml' },
      });
    }

    await supabase
      .from('payment_transactions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('transaction_id', transactionId);

    if (status === 'completed') {
      await applyPostPaymentSuccess(
        supabase,
        txn.user_id as string,
        txn.type as string,
        (txn.challenge_id as string) ?? null,
        Number(txn.amount),
        transactionId,
      );
    }

    return new NextResponse(buildWechatXmlResponse('SUCCESS', 'OK'), {
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (error) {
    console.error('WeChat callback error:', error);
    return new NextResponse(
      buildWechatXmlResponse('FAIL', '澶勭悊澶辫触'),
      { status: 500, headers: { 'Content-Type': 'application/xml' } },
    );
  }
}

async function handleAlipayCallback(request: NextRequest) {
  try {
    const formBody = await request.text();
    const params = parseAlipayFormData(formBody);

    const publicKey = process.env.ALIPAY_PUBLIC_KEY!;
    if (!verifyAlipaySignature(params, publicKey)) {
      return new NextResponse('fail', { status: 400 });
    }

    const transactionId = params.out_trade_no;
    const status = mapAlipayTradeStatus(params.trade_status);
    const supabase = await createClient();

    const { data: txn } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('transaction_id', transactionId)
      .single();

    if (!txn) {
      return new NextResponse('success');
    }

    await supabase
      .from('payment_transactions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('transaction_id', transactionId);

    if (status === 'completed') {
      await applyPostPaymentSuccess(
        supabase,
        txn.user_id as string,
        txn.type as string,
        (txn.challenge_id as string) ?? null,
        Number(txn.amount),
        transactionId,
      );
    }

    return new NextResponse('success');
  } catch (error) {
    console.error('Alipay callback error:', error);
    return new NextResponse('fail', { status: 500 });
  }
}

async function applyPostPaymentSuccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  type: string,
  challengeId: string | null,
  amount: number,
  transactionId: string,
) {
  if (type === 'deposit') {
    let resolvedChallengeId = challengeId;

    if (resolvedChallengeId) {
      await supabase
        .from('challenges')
        .update({
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', resolvedChallengeId)
        .eq('user_id', userId);
    } else {
      resolvedChallengeId = await createActiveChallengeForUser(supabase, userId);
    }

    if (resolvedChallengeId) {
      await supabase
        .from('payment_transactions')
        .update({
          challenge_id: resolvedChallengeId,
          updated_at: new Date().toISOString(),
        })
        .eq('transaction_id', transactionId);
    }
    return;
  }

  if (type === 'membership') {
    await applyMembershipUpgrade(supabase, userId, amount);
  }
}

function parseWechatXml(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>|<(\w+)>(.*?)<\/\3>/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml)) !== null) {
    const key = match[1] || match[3];
    const value = match[2] || match[4];
    if (key && value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}

function buildWechatXmlResponse(returnCode: string, returnMsg: string): string {
  return `<xml><return_code><![CDATA[${returnCode}]]></return_code><return_msg><![CDATA[${returnMsg}]]></return_msg></xml>`;
}

function parseAlipayFormData(formData: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pairs = formData.split('&');

  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split('=');
    if (key) {
      result[key] = decodeURIComponent(valueParts.join('='));
    }
  }

  return result;
}


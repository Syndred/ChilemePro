import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import {
  mapStripeStatus,
  fromStripeAmount,
  mapWechatTradeState,
  fromWechatAmount,
  mapAlipayTradeStatus,
  fromAlipayAmount,
  verifyWechatSignature,
  verifyAlipaySignature,
  getMembershipTierFromAmount,
  calculateMembershipExpiry,
} from '@/lib/utils/payment';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-05-28.basil',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * POST /api/webhooks
 * Handle payment webhook events from Stripe, WeChat Pay, and Alipay.
 * Requirement 18.1: Stripe payment integration
 * Requirement 18.2: WeChat Pay integration
 * Requirement 18.3: Alipay integration
 * Requirement 18.6: Record all payment transactions
 *
 * Routes to the correct handler based on request headers/params:
 * - Stripe: identified by 'stripe-signature' header
 * - WeChat Pay: identified by 'provider=wechat' query param (XML body)
 * - Alipay: identified by 'provider=alipay' query param (form-encoded body)
 */
export async function POST(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get('provider');

  if (provider === 'wechat') {
    return handleWechatCallback(request);
  }

  if (provider === 'alipay') {
    return handleAlipayCallback(request);
  }

  // Default: Stripe webhook (identified by stripe-signature header)
  return handleStripeWebhook(request);
}

// --- Stripe Webhook Handler ---

async function handleStripeWebhook(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 },
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailure(event.data.object as Stripe.PaymentIntent);
        break;

      default:
        // Unhandled event type — acknowledge receipt
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 },
    );
  }
}

/**
 * Handle successful payment.
 * Updates transaction status and activates deposit/membership as needed.
 */
async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  const supabase = await createClient();
  const status = mapStripeStatus(paymentIntent.status);
  const { userId, type, challengeId } = paymentIntent.metadata;

  // Update payment transaction status
  await supabase
    .from('payment_transactions')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('transaction_id', paymentIntent.id);

  // Handle deposit payment — activate the challenge
  if (type === 'deposit' && challengeId) {
    await supabase
      .from('challenges')
      .update({
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', challengeId)
      .eq('user_id', userId);
  }

  // Handle membership payment — update user membership
  if (type === 'membership' && userId) {
    const amount = fromStripeAmount(paymentIntent.amount);
    const tier = getMembershipTierFromAmount(amount);

    if (tier) {
      // Get current membership expiry
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
  }
}

/**
 * Handle failed payment.
 * Requirement 18.4: Record failure for retry.
 */
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


// --- WeChat Pay Callback Handler ---
// Requirement 18.2: WeChat Pay integration

async function handleWechatCallback(request: NextRequest) {
  try {
    const xmlBody = await request.text();

    // Parse XML body into key-value pairs
    // WeChat Pay sends XML like: <xml><return_code>SUCCESS</return_code>...</xml>
    const params = parseWechatXml(xmlBody);

    // Verify signature
    const apiKey = process.env.WECHAT_PAY_API_KEY!;
    if (!verifyWechatSignature(params, apiKey)) {
      return new NextResponse(
        buildWechatXmlResponse('FAIL', '签名验证失败'),
        { status: 400, headers: { 'Content-Type': 'application/xml' } },
      );
    }

    if (params.return_code !== 'SUCCESS' || params.result_code !== 'SUCCESS') {
      return new NextResponse(
        buildWechatXmlResponse('SUCCESS', 'OK'),
        { headers: { 'Content-Type': 'application/xml' } },
      );
    }

    const supabase = await createClient();
    const outTradeNo = params.out_trade_no;
    const tradeState = params.result_code; // SUCCESS in this branch
    const status = mapWechatTradeState(tradeState);

    // Look up the transaction by out_trade_no
    const { data: txn } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('transaction_id', outTradeNo)
      .single();

    if (!txn) {
      return new NextResponse(
        buildWechatXmlResponse('SUCCESS', 'OK'),
        { headers: { 'Content-Type': 'application/xml' } },
      );
    }

    // Update transaction status
    await supabase
      .from('payment_transactions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('transaction_id', outTradeNo);

    // Handle post-payment actions
    if (status === 'completed') {
      await handleProviderPaymentSuccess(
        supabase,
        txn.user_id as string,
        txn.type as string,
        txn.challenge_id as string | null,
        Number(txn.amount),
      );
    }

    return new NextResponse(
      buildWechatXmlResponse('SUCCESS', 'OK'),
      { headers: { 'Content-Type': 'application/xml' } },
    );
  } catch (error) {
    console.error('WeChat Pay callback error:', error);
    return new NextResponse(
      buildWechatXmlResponse('FAIL', '处理失败'),
      { status: 500, headers: { 'Content-Type': 'application/xml' } },
    );
  }
}

// --- Alipay Callback Handler ---
// Requirement 18.3: Alipay integration

async function handleAlipayCallback(request: NextRequest) {
  try {
    const formData = await request.text();
    const params = parseAlipayFormData(formData);

    // Verify signature
    const publicKey = process.env.ALIPAY_PUBLIC_KEY!;
    if (!verifyAlipaySignature(params, publicKey)) {
      return new NextResponse('fail', { status: 400 });
    }

    const supabase = await createClient();
    const outTradeNo = params.out_trade_no;
    const tradeStatus = params.trade_status;
    const status = mapAlipayTradeStatus(tradeStatus);

    // Look up the transaction by out_trade_no
    const { data: txn } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('transaction_id', outTradeNo)
      .single();

    if (!txn) {
      return new NextResponse('success');
    }

    // Update transaction status
    await supabase
      .from('payment_transactions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('transaction_id', outTradeNo);

    // Handle post-payment actions
    if (status === 'completed') {
      // Parse metadata from passback_params
      await handleProviderPaymentSuccess(
        supabase,
        txn.user_id as string,
        txn.type as string,
        txn.challenge_id as string | null,
        Number(txn.amount),
      );
    }

    // Alipay expects plain text "success" response
    return new NextResponse('success');
  } catch (error) {
    console.error('Alipay callback error:', error);
    return new NextResponse('fail', { status: 500 });
  }
}

// --- Shared Post-Payment Handler ---

/**
 * Handle successful payment for any provider (WeChat/Alipay).
 * Activates challenges for deposits, updates membership for subscriptions.
 */
async function handleProviderPaymentSuccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  type: string,
  challengeId: string | null,
  amount: number,
) {
  // Handle deposit payment — activate the challenge
  if (type === 'deposit' && challengeId) {
    await supabase
      .from('challenges')
      .update({
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', challengeId)
      .eq('user_id', userId);
  }

  // Handle membership payment — update user membership
  if (type === 'membership') {
    const tier = getMembershipTierFromAmount(amount);

    if (tier) {
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
  }
}

// --- XML/Form Parsing Helpers ---

/**
 * Parse WeChat Pay XML response into key-value pairs.
 * WeChat Pay sends callbacks as XML: <xml><key>value</key>...</xml>
 */
function parseWechatXml(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>|<(\w+)>(.*?)<\/\3>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const key = match[1] || match[3];
    const value = match[2] || match[4];
    if (key && value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Build WeChat Pay XML response.
 */
function buildWechatXmlResponse(returnCode: string, returnMsg: string): string {
  return `<xml><return_code><![CDATA[${returnCode}]]></return_code><return_msg><![CDATA[${returnMsg}]]></return_msg></xml>`;
}

/**
 * Parse Alipay form-encoded callback data into key-value pairs.
 */
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

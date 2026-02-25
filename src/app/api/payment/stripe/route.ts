import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import {
  buildPaymentIntent,
  getPaymentDescription,
  STRIPE_CURRENCY,
} from '@/lib/utils/payment';
import type { PaymentTransactionType } from '@/types';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-05-28.basil',
});

/**
 * POST /api/payment/stripe
 * Create a Stripe PaymentIntent for deposit or membership payment.
 * Requirement 18.1: Stripe payment integration
 * Requirement 18.5: Secure payment handling
 * Requirement 18.6: Record all payment transactions
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: '请先登录' },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { type, amount, challengeId } = body as {
      type: PaymentTransactionType;
      amount: number;
      challengeId?: string;
    };

    if (!type || !amount) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 },
      );
    }

    // Build and validate payment intent using pure function
    const intentInput = buildPaymentIntent({
      type,
      amount,
      userId: user.id,
      challengeId,
    });

    if (!intentInput.valid) {
      return NextResponse.json(
        { error: intentInput.error },
        { status: 400 },
      );
    }

    const description = getPaymentDescription(type, amount);

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: intentInput.amountInCents,
      currency: STRIPE_CURRENCY,
      metadata: intentInput.metadata,
      description,
      automatic_payment_methods: { enabled: true },
    });

    // Record the pending transaction in our database
    // Requirement 18.6: Record all payment transactions
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
    });
  } catch (error) {
    // Requirement 18.4: Show error info on payment failure
    console.error('Stripe payment error:', error);
    return NextResponse.json(
      { error: '支付创建失败，请重试' },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  buildAlipayOrder,
} from '@/lib/utils/payment';
import type { PaymentTransactionType } from '@/types';

const ALIPAY_APP_ID = process.env.ALIPAY_APP_ID!;
const ALIPAY_PRIVATE_KEY = process.env.ALIPAY_PRIVATE_KEY!;
const ALIPAY_PUBLIC_KEY = process.env.ALIPAY_PUBLIC_KEY!;
const ALIPAY_NOTIFY_URL = process.env.ALIPAY_NOTIFY_URL!;

/**
 * POST /api/payment/alipay
 * Create an Alipay trade order for deposit or membership payment.
 * Requirement 18.3: Alipay integration (domestic users)
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
    const { type, amount, challengeId, returnUrl } = body as {
      type: PaymentTransactionType;
      amount: number;
      challengeId?: string;
      returnUrl: string;
    };

    if (!type || !amount) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 },
      );
    }

    // Build and validate order using pure function
    const orderInput = buildAlipayOrder({
      type,
      amount,
      userId: user.id,
      challengeId,
      returnUrl: returnUrl || `${process.env.NEXT_PUBLIC_APP_URL}/challenge`,
    });

    if (!orderInput.valid) {
      return NextResponse.json(
        { error: orderInput.error },
        { status: 400 },
      );
    }

    // In production: call Alipay's alipay.trade.wap.pay or alipay.trade.page.pay API
    // using the Alipay SDK with RSA2 signing
    const alipayOrderParams = {
      app_id: ALIPAY_APP_ID,
      method: 'alipay.trade.wap.pay',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      version: '1.0',
      notify_url: ALIPAY_NOTIFY_URL,
      biz_content: JSON.stringify({
        out_trade_no: orderInput.outTradeNo,
        total_amount: orderInput.totalAmount,
        subject: orderInput.subject,
        product_code: 'QUICK_WAP_WAY',
        passback_params: encodeURIComponent(JSON.stringify(orderInput.metadata)),
      }),
    };

    // Record the pending transaction in our database
    // Requirement 18.6: Record all payment transactions
    await supabase.from('payment_transactions').insert({
      user_id: user.id,
      challenge_id: challengeId ?? null,
      type,
      amount,
      payment_method: 'alipay',
      payment_provider: 'alipay',
      transaction_id: orderInput.outTradeNo,
      status: 'pending',
    });

    // In production, this would return a signed URL or form HTML
    // that redirects the user to Alipay's payment page
    return NextResponse.json({
      outTradeNo: orderInput.outTradeNo,
      // In production: payUrl or formHtml for redirect
      alipayParams: alipayOrderParams,
    });
  } catch (error) {
    // Requirement 18.4: Show error info on payment failure
    console.error('Alipay payment error:', error);
    return NextResponse.json(
      { error: '支付宝支付创建失败，请重试' },
      { status: 500 },
    );
  }
}

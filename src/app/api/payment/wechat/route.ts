import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  buildWechatPayOrder,
} from '@/lib/utils/payment';
import type { PaymentTransactionType } from '@/types';

const WECHAT_APP_ID = process.env.WECHAT_PAY_APP_ID!;
const WECHAT_MCH_ID = process.env.WECHAT_PAY_MCH_ID!;
const WECHAT_API_KEY = process.env.WECHAT_PAY_API_KEY!;
const WECHAT_NOTIFY_URL = process.env.WECHAT_PAY_NOTIFY_URL!;

/**
 * POST /api/payment/wechat
 * Create a WeChat Pay unified order for deposit or membership payment.
 * Requirement 18.2: WeChat Pay integration (domestic users)
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
    const { type, amount, challengeId, openId } = body as {
      type: PaymentTransactionType;
      amount: number;
      challengeId?: string;
      openId: string;
    };

    if (!type || !amount) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 },
      );
    }

    // Get client IP for WeChat Pay requirement
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || '127.0.0.1';

    // Build and validate order using pure function
    const orderInput = buildWechatPayOrder({
      type,
      amount,
      userId: user.id,
      challengeId,
      openId,
      clientIp,
    });

    if (!orderInput.valid) {
      return NextResponse.json(
        { error: orderInput.error },
        { status: 400 },
      );
    }

    // In production: call WeChat Pay Unified Order API
    // POST https://api.mch.weixin.qq.com/pay/unifiedorder
    // with XML body containing appid, mch_id, nonce_str, sign, body,
    // out_trade_no, total_fee, spbill_create_ip, notify_url, trade_type, openid
    const wechatOrderParams = {
      appid: WECHAT_APP_ID,
      mch_id: WECHAT_MCH_ID,
      body: orderInput.body,
      out_trade_no: orderInput.outTradeNo,
      total_fee: orderInput.totalFee,
      spbill_create_ip: clientIp,
      notify_url: WECHAT_NOTIFY_URL,
      trade_type: 'JSAPI',
      openid: orderInput.openId,
    };

    // Record the pending transaction in our database
    // Requirement 18.6: Record all payment transactions
    await supabase.from('payment_transactions').insert({
      user_id: user.id,
      challenge_id: challengeId ?? null,
      type,
      amount,
      payment_method: 'wechat',
      payment_provider: 'wechat',
      transaction_id: orderInput.outTradeNo,
      status: 'pending',
    });

    // In production, this would return the prepay_id from WeChat's response
    // and the client would use it to invoke WeChat Pay JS SDK
    return NextResponse.json({
      outTradeNo: orderInput.outTradeNo,
      // In production: prepayId, paySign, timeStamp, nonceStr, signType
      // would be returned for the client to call wx.requestPayment()
      wechatParams: wechatOrderParams,
    });
  } catch (error) {
    // Requirement 18.4: Show error info on payment failure
    console.error('WeChat Pay error:', error);
    return NextResponse.json(
      { error: '微信支付创建失败，请重试' },
      { status: 500 },
    );
  }
}

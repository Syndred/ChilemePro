import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/payment/alipay
 * Explicitly return not implemented until a real Alipay SDK flow is wired.
 */
export async function POST(request: NextRequest) {
  void request;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '璇峰厛鐧诲綍' }, { status: 401 });
  }

  return NextResponse.json(
    {
      error: '褰撳墠鐜鏈惎鐢ㄦ敮浠樺疂鏀粯锛岃浣跨敤 Stripe 鏀粯',
      provider: 'alipay',
      enabled: false,
    },
    { status: 501 },
  );
}


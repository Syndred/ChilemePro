import { NextRequest, NextResponse } from 'next/server';
import { runDailySettlement } from '@/app/actions/challenge';

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const headerSecret = request.headers.get('x-cron-secret');
  const querySecret = request.nextUrl.searchParams.get('secret');
  return headerSecret === secret || querySecret === secret;
}

async function handler(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runDailySettlement();
  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  return handler(request);
}

export async function POST(request: NextRequest) {
  return handler(request);
}

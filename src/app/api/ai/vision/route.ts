import { NextRequest, NextResponse } from 'next/server';
import { recognizeFoodWithTimeout } from '@/services/ai/visionService';
import { createClient } from '@/lib/supabase/server';
import { checkAiPhotoUsage } from '@/lib/utils/membership';
import type { MembershipTier } from '@/types';

export const runtime = 'nodejs';

async function getDailyAiUsage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  today: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('ai_usage_logs')
    .select('usage_count')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .maybeSingle();

  if (!error && data) {
    return Number(data.usage_count ?? 0);
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const { count } = await supabase
    .from('meal_records')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('image_url', 'is', null)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString());

  return count ?? 0;
}

async function increaseAiUsage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  today: string,
): Promise<void> {
  const { data: row } = await supabase
    .from('ai_usage_logs')
    .select('id, usage_count')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .maybeSingle();

  if (row?.id) {
    await supabase
      .from('ai_usage_logs')
      .update({
        usage_count: Number(row.usage_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id as string);
    return;
  }

  await supabase.from('ai_usage_logs').insert({
    user_id: userId,
    usage_date: today,
    usage_count: 1,
  });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Please login first.' }, { status: 401 });
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('membership_tier, membership_expires_at')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return NextResponse.json({ success: false, error: 'Failed to read membership status.' }, { status: 500 });
    }

    const today = new Date().toISOString().split('T')[0];
    const dailyUsageCount = await getDailyAiUsage(supabase, user.id, today);
    const access = checkAiPhotoUsage(
      (userData.membership_tier as MembershipTier) || 'free',
      userData.membership_expires_at ? new Date(userData.membership_expires_at as string) : null,
      dailyUsageCount,
    );

    if (!access.allowed) {
      return NextResponse.json(
        {
          success: false,
          limitExceeded: true,
          error: access.reason ?? 'Daily AI limit reached.',
        },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'Missing image file.' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ success: false, error: 'Invalid image file type.' }, { status: 400 });
    }

    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: 'Image size cannot exceed 10MB.' }, { status: 400 });
    }

    await increaseAiUsage(supabase, user.id, today).catch(() => {
      // Keep request functional even when usage table is unavailable.
    });

    const arrayBuffer = await file.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');
    const result = await recognizeFoodWithTimeout(base64Image);

    if (result === null) {
      return NextResponse.json(
        {
          success: false,
          timedOut: true,
          error: 'AI recognition timed out. Please switch to manual input.',
        },
        { status: 408 },
      );
    }

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unable to identify food from this image.',
          data: result,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
      usage: {
        used: dailyUsageCount + 1,
        remaining: Number.isFinite(access.remaining) ? access.remaining - 1 : Infinity,
      },
    });
  } catch (error) {
    console.error('Vision API error:', error);
    return NextResponse.json({ success: false, error: 'Vision service error.' }, { status: 500 });
  }
}

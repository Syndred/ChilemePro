'use server';

import { createClient } from '@/lib/supabase/server';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export async function savePushSubscription(
  input: PushSubscriptionInput,
): Promise<ActionResult> {
  if (!input.endpoint || !input.keys?.p256dh || !input.keys?.auth) {
    return { success: false, error: '订阅数据无效' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        enabled: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    );

    if (error) {
      return { success: false, error: '保存推送订阅失败' };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误，请稍后重试' };
  }
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  if (!endpoint) {
    return { success: false, error: '订阅 endpoint 不能为空' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);

    if (error) {
      return { success: false, error: '删除推送订阅失败' };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误，请稍后重试' };
  }
}

export async function hasActivePushSubscription(): Promise<ActionResult<{ active: boolean }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { count, error } = await supabase
      .from('push_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('enabled', true);

    if (error) {
      return { success: false, error: '查询推送订阅状态失败' };
    }

    return { success: true, data: { active: (count ?? 0) > 0 } };
  } catch {
    return { success: false, error: '服务器错误，请稍后重试' };
  }
}

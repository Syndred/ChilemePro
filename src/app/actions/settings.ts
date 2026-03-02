'use server';

import { createClient } from '@/lib/supabase/server';
import {
  type UserSettings,
  type NotificationSettings,
  type PrivacySettings,
  validateNotificationSettings,
  validatePrivacySettings,
  mergeNotificationSettings,
  mergePrivacySettings,
  maskPhone,
} from '@/lib/utils/settings';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function getUserSettings(): Promise<ActionResult<UserSettings>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const [{ data: userData, error: userError }, { data: settingsRow }] = await Promise.all([
      supabase.from('users').select('phone, wechat_id').eq('id', user.id).single(),
      supabase
        .from('user_settings')
        .select('notification_settings, privacy_settings')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    if (userError || !userData) {
      return { success: false, error: '获取用户信息失败' };
    }

    const notificationSettings = mergeNotificationSettings(
      (settingsRow?.notification_settings as Partial<NotificationSettings>) ?? {},
    );
    const privacySettings = mergePrivacySettings(
      (settingsRow?.privacy_settings as Partial<PrivacySettings>) ?? {},
    );

    return {
      success: true,
      data: {
        notifications: notificationSettings,
        privacy: privacySettings,
        account: {
          phone: maskPhone((userData.phone as string | null) ?? null),
          wechatBound: !!userData.wechat_id,
        },
      },
    };
  } catch {
    return { success: false, error: '服务器错误，请稍后重试' };
  }
}

export async function updateNotificationSettings(
  input: NotificationSettings,
): Promise<ActionResult> {
  const validation = validateNotificationSettings(input);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { error } = await supabase.from('user_settings').upsert(
      {
        user_id: user.id,
        notification_settings: validation.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (error) {
      return { success: false, error: '保存通知设置失败' };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误，请稍后重试' };
  }
}

export async function updatePrivacySettings(input: PrivacySettings): Promise<ActionResult> {
  const validation = validatePrivacySettings(input);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { error } = await supabase.from('user_settings').upsert(
      {
        user_id: user.id,
        privacy_settings: validation.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (error) {
      return { success: false, error: '保存隐私设置失败' };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误，请稍后重试' };
  }
}

export async function logoutUser(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      return { success: false, error: '退出登录失败，请重试' };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误，请稍后重试' };
  }
}

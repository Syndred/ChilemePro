'use server';

import { createClient } from '@/lib/supabase/server';
import {
  type UserSettings,
  type NotificationSettings,
  type PrivacySettings,
  getDefaultSettings,
  validateNotificationSettings,
  validatePrivacySettings,
  maskPhone,
} from '@/lib/utils/settings';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Get the current user's settings.
 * Requirement 16.6: Provide settings options (notifications, privacy, account)
 *
 * Settings are stored as JSON in the users table metadata or
 * derived from user profile fields. For MVP, we use sensible defaults
 * and store notification/privacy prefs in localStorage on the client,
 * with account info fetched from the database.
 */
export async function getUserSettings(): Promise<ActionResult<UserSettings>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { data: userData, error } = await supabase
      .from('users')
      .select('phone, wechat_id')
      .eq('id', user.id)
      .single();

    if (error || !userData) {
      return { success: false, error: '获取用户信息失败' };
    }

    const defaults = getDefaultSettings();

    const settings: UserSettings = {
      notifications: defaults.notifications,
      privacy: defaults.privacy,
      account: {
        phone: maskPhone(userData.phone as string | null),
        wechatBound: !!(userData.wechat_id),
      },
    };

    return { success: true, data: settings };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}


/**
 * Update notification settings.
 * Requirement 16.6: Notification settings
 */
export async function updateNotificationSettings(
  input: NotificationSettings,
): Promise<ActionResult> {
  const validation = validateNotificationSettings(input);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // For MVP, notification preferences are stored client-side (localStorage).
  // This action validates the input server-side for consistency.
  return { success: true };
}

/**
 * Update privacy settings.
 * Requirement 16.6: Privacy settings
 */
export async function updatePrivacySettings(
  input: PrivacySettings,
): Promise<ActionResult> {
  const validation = validatePrivacySettings(input);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // For MVP, privacy preferences are stored client-side (localStorage).
  // This action validates the input server-side for consistency.
  return { success: true };
}

/**
 * Log out the current user.
 * Requirement 16.6: Account settings (logout)
 */
export async function logoutUser(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      return { success: false, error: '退出登录失败，请重试' };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

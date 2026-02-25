/**
 * Settings utility functions for the settings page.
 * Requirement 16.6: Provide settings options (notifications, privacy, account)
 *
 * Pure functions for settings validation, defaults, and transformations.
 */

// --- Types ---

export interface NotificationSettings {
  /** 任务提醒 (22:00 daily task reminder) */
  taskReminder: boolean;
  /** 社交通知 (likes, comments) */
  socialNotifications: boolean;
  /** 系统通知 (system announcements, outage alerts) */
  systemNotifications: boolean;
  /** 挑战通知 (challenge updates, reward distribution) */
  challengeNotifications: boolean;
}

export interface PrivacySettings {
  /** 是否在排行榜显示 */
  showOnLeaderboard: boolean;
  /** 是否允许他人查看动态 */
  publicProfile: boolean;
  /** 是否允许被搜索 */
  allowSearch: boolean;
}

export interface AccountSettings {
  /** 绑定的手机号 (masked) */
  phone: string | null;
  /** 绑定的微信 */
  wechatBound: boolean;
}

export interface UserSettings {
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  account: AccountSettings;
}

// --- Defaults ---

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  taskReminder: true,
  socialNotifications: true,
  systemNotifications: true,
  challengeNotifications: true,
};

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  showOnLeaderboard: true,
  publicProfile: true,
  allowSearch: true,
};

export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  phone: null,
  wechatBound: false,
};

export function getDefaultSettings(): UserSettings {
  return {
    notifications: { ...DEFAULT_NOTIFICATION_SETTINGS },
    privacy: { ...DEFAULT_PRIVACY_SETTINGS },
    account: { ...DEFAULT_ACCOUNT_SETTINGS },
  };
}


// --- Validation ---

/**
 * Validate notification settings. All fields must be booleans.
 */
export function validateNotificationSettings(
  input: unknown,
): { valid: true; data: NotificationSettings } | { valid: false; error: string } {
  if (typeof input !== 'object' || input === null) {
    return { valid: false, error: '无效的通知设置' };
  }

  const obj = input as Record<string, unknown>;
  const keys: (keyof NotificationSettings)[] = [
    'taskReminder',
    'socialNotifications',
    'systemNotifications',
    'challengeNotifications',
  ];

  for (const key of keys) {
    if (typeof obj[key] !== 'boolean') {
      return { valid: false, error: `通知设置字段 ${key} 必须是布尔值` };
    }
  }

  return {
    valid: true,
    data: {
      taskReminder: obj.taskReminder as boolean,
      socialNotifications: obj.socialNotifications as boolean,
      systemNotifications: obj.systemNotifications as boolean,
      challengeNotifications: obj.challengeNotifications as boolean,
    },
  };
}

/**
 * Validate privacy settings. All fields must be booleans.
 */
export function validatePrivacySettings(
  input: unknown,
): { valid: true; data: PrivacySettings } | { valid: false; error: string } {
  if (typeof input !== 'object' || input === null) {
    return { valid: false, error: '无效的隐私设置' };
  }

  const obj = input as Record<string, unknown>;
  const keys: (keyof PrivacySettings)[] = [
    'showOnLeaderboard',
    'publicProfile',
    'allowSearch',
  ];

  for (const key of keys) {
    if (typeof obj[key] !== 'boolean') {
      return { valid: false, error: `隐私设置字段 ${key} 必须是布尔值` };
    }
  }

  return {
    valid: true,
    data: {
      showOnLeaderboard: obj.showOnLeaderboard as boolean,
      publicProfile: obj.publicProfile as boolean,
      allowSearch: obj.allowSearch as boolean,
    },
  };
}

// --- Transformations ---

/**
 * Mask a phone number for display: 138****1234
 */
export function maskPhone(phone: string | null): string {
  if (!phone || phone.length < 7) return '未绑定';
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

/**
 * Merge partial notification settings with defaults.
 */
export function mergeNotificationSettings(
  partial: Partial<NotificationSettings>,
): NotificationSettings {
  return { ...DEFAULT_NOTIFICATION_SETTINGS, ...partial };
}

/**
 * Merge partial privacy settings with defaults.
 */
export function mergePrivacySettings(
  partial: Partial<PrivacySettings>,
): PrivacySettings {
  return { ...DEFAULT_PRIVACY_SETTINGS, ...partial };
}

/**
 * Count how many notifications are enabled.
 */
export function countEnabledNotifications(settings: NotificationSettings): number {
  return Object.values(settings).filter(Boolean).length;
}

/**
 * Check if all notifications are disabled.
 */
export function areAllNotificationsDisabled(settings: NotificationSettings): boolean {
  return countEnabledNotifications(settings) === 0;
}

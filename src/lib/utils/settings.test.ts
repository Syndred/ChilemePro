import { describe, it, expect } from 'vitest';
import {
  getDefaultSettings,
  validateNotificationSettings,
  validatePrivacySettings,
  maskPhone,
  mergeNotificationSettings,
  mergePrivacySettings,
  countEnabledNotifications,
  areAllNotificationsDisabled,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_PRIVACY_SETTINGS,
  type NotificationSettings,
  type PrivacySettings,
} from './settings';

// --- getDefaultSettings ---

describe('getDefaultSettings', () => {
  it('returns default settings with all notifications enabled', () => {
    const settings = getDefaultSettings();
    expect(settings.notifications.taskReminder).toBe(true);
    expect(settings.notifications.socialNotifications).toBe(true);
    expect(settings.notifications.systemNotifications).toBe(true);
    expect(settings.notifications.challengeNotifications).toBe(true);
  });

  it('returns default settings with all privacy options enabled', () => {
    const settings = getDefaultSettings();
    expect(settings.privacy.showOnLeaderboard).toBe(true);
    expect(settings.privacy.publicProfile).toBe(true);
    expect(settings.privacy.allowSearch).toBe(true);
  });

  it('returns default account with no bindings', () => {
    const settings = getDefaultSettings();
    expect(settings.account.phone).toBeNull();
    expect(settings.account.wechatBound).toBe(false);
  });

  it('returns independent copies each time', () => {
    const a = getDefaultSettings();
    const b = getDefaultSettings();
    a.notifications.taskReminder = false;
    expect(b.notifications.taskReminder).toBe(true);
  });
});

// --- validateNotificationSettings ---

describe('validateNotificationSettings', () => {
  it('accepts valid notification settings (all true)', () => {
    const result = validateNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.taskReminder).toBe(true);
    }
  });

  it('accepts valid notification settings (all false)', () => {
    const input: NotificationSettings = {
      taskReminder: false,
      socialNotifications: false,
      systemNotifications: false,
      challengeNotifications: false,
    };
    const result = validateNotificationSettings(input);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.taskReminder).toBe(false);
    }
  });

  it('rejects null input', () => {
    const result = validateNotificationSettings(null);
    expect(result.valid).toBe(false);
  });

  it('rejects non-object input', () => {
    const result = validateNotificationSettings('string');
    expect(result.valid).toBe(false);
  });

  it('rejects when a field is not boolean', () => {
    const result = validateNotificationSettings({
      taskReminder: 'yes',
      socialNotifications: true,
      systemNotifications: true,
      challengeNotifications: true,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects when a field is missing', () => {
    const result = validateNotificationSettings({
      taskReminder: true,
      socialNotifications: true,
    });
    expect(result.valid).toBe(false);
  });
});

// --- validatePrivacySettings ---

describe('validatePrivacySettings', () => {
  it('accepts valid privacy settings', () => {
    const result = validatePrivacySettings(DEFAULT_PRIVACY_SETTINGS);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.showOnLeaderboard).toBe(true);
    }
  });

  it('accepts all-false privacy settings', () => {
    const input: PrivacySettings = {
      showOnLeaderboard: false,
      publicProfile: false,
      allowSearch: false,
    };
    const result = validatePrivacySettings(input);
    expect(result.valid).toBe(true);
  });

  it('rejects null input', () => {
    const result = validatePrivacySettings(null);
    expect(result.valid).toBe(false);
  });

  it('rejects non-boolean field', () => {
    const result = validatePrivacySettings({
      showOnLeaderboard: 1,
      publicProfile: true,
      allowSearch: true,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects missing field', () => {
    const result = validatePrivacySettings({
      showOnLeaderboard: true,
    });
    expect(result.valid).toBe(false);
  });
});

// --- maskPhone ---

describe('maskPhone', () => {
  it('masks a standard 11-digit phone number', () => {
    expect(maskPhone('13812345678')).toBe('138****5678');
  });

  it('returns 未绑定 for null', () => {
    expect(maskPhone(null)).toBe('未绑定');
  });

  it('returns 未绑定 for empty string', () => {
    expect(maskPhone('')).toBe('未绑定');
  });

  it('returns 未绑定 for short phone', () => {
    expect(maskPhone('123456')).toBe('未绑定');
  });

  it('masks a longer number correctly', () => {
    const result = maskPhone('+8613812345678');
    expect(result).toBe('+86****5678');
  });
});

// --- mergeNotificationSettings ---

describe('mergeNotificationSettings', () => {
  it('returns defaults when given empty partial', () => {
    const result = mergeNotificationSettings({});
    expect(result).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
  });

  it('overrides specific fields', () => {
    const result = mergeNotificationSettings({ taskReminder: false });
    expect(result.taskReminder).toBe(false);
    expect(result.socialNotifications).toBe(true);
  });
});

// --- mergePrivacySettings ---

describe('mergePrivacySettings', () => {
  it('returns defaults when given empty partial', () => {
    const result = mergePrivacySettings({});
    expect(result).toEqual(DEFAULT_PRIVACY_SETTINGS);
  });

  it('overrides specific fields', () => {
    const result = mergePrivacySettings({ publicProfile: false });
    expect(result.publicProfile).toBe(false);
    expect(result.showOnLeaderboard).toBe(true);
  });
});

// --- countEnabledNotifications ---

describe('countEnabledNotifications', () => {
  it('returns 4 when all enabled', () => {
    expect(countEnabledNotifications(DEFAULT_NOTIFICATION_SETTINGS)).toBe(4);
  });

  it('returns 0 when all disabled', () => {
    expect(
      countEnabledNotifications({
        taskReminder: false,
        socialNotifications: false,
        systemNotifications: false,
        challengeNotifications: false,
      }),
    ).toBe(0);
  });

  it('returns correct count for mixed', () => {
    expect(
      countEnabledNotifications({
        taskReminder: true,
        socialNotifications: false,
        systemNotifications: true,
        challengeNotifications: false,
      }),
    ).toBe(2);
  });
});

// --- areAllNotificationsDisabled ---

describe('areAllNotificationsDisabled', () => {
  it('returns false when some are enabled', () => {
    expect(areAllNotificationsDisabled(DEFAULT_NOTIFICATION_SETTINGS)).toBe(false);
  });

  it('returns true when all are disabled', () => {
    expect(
      areAllNotificationsDisabled({
        taskReminder: false,
        socialNotifications: false,
        systemNotifications: false,
        challengeNotifications: false,
      }),
    ).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import {
  calculateCheckInStats,
  validateEditProfile,
  generateInviteInfo,
  getMembershipLabel,
  getGenderLabel,
  getActivityLevelLabel,
  NICKNAME_MAX_LENGTH,
  HEIGHT_MIN,
  HEIGHT_MAX,
  WEIGHT_MIN,
  WEIGHT_MAX,
  AGE_MIN,
  AGE_MAX,
} from './profile';

// --- calculateCheckInStats ---

describe('calculateCheckInStats', () => {
  it('returns zeros for empty dates', () => {
    const stats = calculateCheckInStats([], 0);
    expect(stats.totalCheckInDays).toBe(0);
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(0);
    expect(stats.totalMealRecords).toBe(0);
  });

  it('counts unique dates correctly', () => {
    const dates = ['2024-01-01', '2024-01-01', '2024-01-02'];
    const stats = calculateCheckInStats(dates, 3);
    expect(stats.totalCheckInDays).toBe(2);
    expect(stats.totalMealRecords).toBe(3);
  });

  it('calculates longest streak for consecutive dates', () => {
    const dates = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-05', '2024-01-06'];
    const stats = calculateCheckInStats(dates, 5);
    expect(stats.longestStreak).toBe(3);
  });

  it('handles single date', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const stats = calculateCheckInStats([todayStr], 1);
    expect(stats.totalCheckInDays).toBe(1);
    expect(stats.currentStreak).toBe(1);
    expect(stats.longestStreak).toBe(1);
  });

  it('sets current streak to 0 if last date is not recent', () => {
    const dates = ['2020-01-01', '2020-01-02', '2020-01-03'];
    const stats = calculateCheckInStats(dates, 3);
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(3);
  });

  it('calculates current streak from today', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dates: string[] = [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    const stats = calculateCheckInStats(dates, 3);
    expect(stats.currentStreak).toBe(3);
  });

  it('calculates current streak from yesterday', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dayBefore = new Date(today);
    dayBefore.setDate(dayBefore.getDate() - 2);
    const dates = [
      dayBefore.toISOString().split('T')[0],
      yesterday.toISOString().split('T')[0],
    ];
    const stats = calculateCheckInStats(dates, 2);
    expect(stats.currentStreak).toBe(2);
  });

  it('handles unsorted dates', () => {
    const dates = ['2024-01-03', '2024-01-01', '2024-01-02'];
    const stats = calculateCheckInStats(dates, 3);
    expect(stats.longestStreak).toBe(3);
    expect(stats.totalCheckInDays).toBe(3);
  });
});

// --- validateEditProfile ---

describe('validateEditProfile', () => {
  const validInput = {
    nickname: '测试用户',
    height: 170,
    weight: 65,
    targetWeight: 60,
    age: 25,
    gender: 'male' as const,
    activityLevel: 'moderate' as const,
  };

  it('accepts valid input', () => {
    const result = validateEditProfile(validInput);
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('rejects empty nickname', () => {
    const result = validateEditProfile({ ...validInput, nickname: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.nickname).toBeDefined();
  });

  it('rejects nickname exceeding max length', () => {
    const result = validateEditProfile({
      ...validInput,
      nickname: 'a'.repeat(NICKNAME_MAX_LENGTH + 1),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.nickname).toBeDefined();
  });

  it('rejects height below minimum', () => {
    const result = validateEditProfile({ ...validInput, height: HEIGHT_MIN - 1 });
    expect(result.valid).toBe(false);
    expect(result.errors.height).toBeDefined();
  });

  it('rejects height above maximum', () => {
    const result = validateEditProfile({ ...validInput, height: HEIGHT_MAX + 1 });
    expect(result.valid).toBe(false);
    expect(result.errors.height).toBeDefined();
  });

  it('rejects weight below minimum', () => {
    const result = validateEditProfile({ ...validInput, weight: WEIGHT_MIN - 1 });
    expect(result.valid).toBe(false);
    expect(result.errors.weight).toBeDefined();
  });

  it('rejects weight above maximum', () => {
    const result = validateEditProfile({ ...validInput, weight: WEIGHT_MAX + 1 });
    expect(result.valid).toBe(false);
    expect(result.errors.weight).toBeDefined();
  });

  it('rejects age below minimum', () => {
    const result = validateEditProfile({ ...validInput, age: AGE_MIN - 1 });
    expect(result.valid).toBe(false);
    expect(result.errors.age).toBeDefined();
  });

  it('rejects age above maximum', () => {
    const result = validateEditProfile({ ...validInput, age: AGE_MAX + 1 });
    expect(result.valid).toBe(false);
    expect(result.errors.age).toBeDefined();
  });

  it('rejects non-integer age', () => {
    const result = validateEditProfile({ ...validInput, age: 25.5 });
    expect(result.valid).toBe(false);
    expect(result.errors.age).toBeDefined();
  });

  it('rejects NaN height', () => {
    const result = validateEditProfile({ ...validInput, height: NaN });
    expect(result.valid).toBe(false);
    expect(result.errors.height).toBeDefined();
  });

  it('rejects invalid gender', () => {
    const result = validateEditProfile({ ...validInput, gender: 'invalid' as any });
    expect(result.valid).toBe(false);
    expect(result.errors.gender).toBeDefined();
  });

  it('rejects invalid activity level', () => {
    const result = validateEditProfile({ ...validInput, activityLevel: 'invalid' as any });
    expect(result.valid).toBe(false);
    expect(result.errors.activityLevel).toBeDefined();
  });

  it('accepts boundary values', () => {
    const result = validateEditProfile({
      ...validInput,
      height: HEIGHT_MIN,
      weight: WEIGHT_MIN,
      targetWeight: WEIGHT_MAX,
      age: AGE_MIN,
    });
    expect(result.valid).toBe(true);
  });

  it('collects multiple errors', () => {
    const result = validateEditProfile({
      nickname: '',
      height: 0,
      weight: 0,
      targetWeight: 0,
      age: 0,
      gender: 'invalid' as any,
      activityLevel: 'invalid' as any,
    });
    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors).length).toBeGreaterThan(1);
  });
});

// --- generateInviteInfo ---

describe('generateInviteInfo', () => {
  it('generates invite code from userId', () => {
    const info = generateInviteInfo('abc12345-6789-0000-1111-222233334444', 'https://example.com');
    expect(info.inviteCode).toBe('ABC12345');
    expect(info.inviteLink).toContain('https://example.com/invite?code=');
    expect(info.inviteMessage).toContain('吃了么');
    expect(info.inviteMessage).toContain(info.inviteLink);
  });

  it('generates different codes for different users', () => {
    const info1 = generateInviteInfo('aaaa1111-0000-0000-0000-000000000000', 'https://app.com');
    const info2 = generateInviteInfo('bbbb2222-0000-0000-0000-000000000000', 'https://app.com');
    expect(info1.inviteCode).not.toBe(info2.inviteCode);
  });

  it('handles short userId', () => {
    const info = generateInviteInfo('abc', 'https://app.com');
    expect(info.inviteCode.length).toBeLessThanOrEqual(8);
    expect(info.inviteLink).toContain('https://app.com/invite');
  });
});

// --- getMembershipLabel ---

describe('getMembershipLabel', () => {
  it('returns 免费版 for free tier', () => {
    expect(getMembershipLabel('free')).toBe('免费版');
  });

  it('returns 尊享会员 for monthly', () => {
    expect(getMembershipLabel('monthly')).toBe('尊享会员');
  });

  it('returns 尊享会员 for yearly', () => {
    expect(getMembershipLabel('yearly')).toBe('尊享会员');
  });

  it('returns 免费版 for unknown tier', () => {
    expect(getMembershipLabel('unknown')).toBe('免费版');
  });
});

// --- getGenderLabel ---

describe('getGenderLabel', () => {
  it('returns correct labels', () => {
    expect(getGenderLabel('male')).toBe('男');
    expect(getGenderLabel('female')).toBe('女');
    expect(getGenderLabel('other')).toBe('其他');
  });
});

// --- getActivityLevelLabel ---

describe('getActivityLevelLabel', () => {
  it('returns correct labels', () => {
    expect(getActivityLevelLabel('sedentary')).toBe('久坐');
    expect(getActivityLevelLabel('light')).toBe('轻度活动');
    expect(getActivityLevelLabel('moderate')).toBe('中度活动');
    expect(getActivityLevelLabel('active')).toBe('高度活动');
    expect(getActivityLevelLabel('very_active')).toBe('极高活动');
  });
});

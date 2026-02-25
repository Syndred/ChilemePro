/**
 * Pure profile business logic — no side effects, fully testable.
 *
 * Requirement 16.1: Edit personal info (nickname, avatar, basic info)
 * Requirement 16.2: Display check-in statistics
 * Requirement 16.3: Display reward balance and withdrawal history
 * Requirement 16.4: Membership center entry
 * Requirement 16.5: Invite friends functionality
 */

import type { Gender, ActivityLevel } from '@/types';

// --- Types ---

export interface CheckInStats {
  /** Total days with at least one meal record */
  totalCheckInDays: number;
  /** Current consecutive check-in streak */
  currentStreak: number;
  /** Longest consecutive check-in streak */
  longestStreak: number;
  /** Total meal records */
  totalMealRecords: number;
}

export interface ProfileSummary {
  nickname: string;
  avatar: string;
  height: number;
  weight: number;
  targetWeight: number;
  age: number;
  gender: Gender;
  activityLevel: ActivityLevel;
  dailyCalorieTarget: number;
  membershipTier: string;
  membershipExpiresAt: Date | null;
  rewardBalance: number;
  checkInStats: CheckInStats;
}

export interface EditProfileInput {
  nickname: string;
  avatar?: string;
  height: number;
  weight: number;
  targetWeight: number;
  age: number;
  gender: Gender;
  activityLevel: ActivityLevel;
}

export interface EditProfileValidation {
  valid: boolean;
  errors: Record<string, string>;
}

export interface InviteInfo {
  inviteCode: string;
  inviteLink: string;
  inviteMessage: string;
}

// --- Constants ---

export const NICKNAME_MIN_LENGTH = 1;
export const NICKNAME_MAX_LENGTH = 20;
export const HEIGHT_MIN = 100;
export const HEIGHT_MAX = 250;
export const WEIGHT_MIN = 30;
export const WEIGHT_MAX = 300;
export const AGE_MIN = 10;
export const AGE_MAX = 120;

// --- Pure Functions ---

/**
 * Calculate check-in statistics from a list of dates that have meal records.
 * Each date string should be in 'YYYY-MM-DD' format.
 */
export function calculateCheckInStats(
  recordDates: string[],
  totalMealRecords: number,
): CheckInStats {
  if (recordDates.length === 0) {
    return {
      totalCheckInDays: 0,
      currentStreak: 0,
      longestStreak: 0,
      totalMealRecords,
    };
  }

  // Deduplicate and sort dates
  const uniqueDates = [...new Set(recordDates)].sort();
  const totalCheckInDays = uniqueDates.length;

  // Calculate streaks
  let currentStreak = 1;
  let longestStreak = 1;
  let tempStreak = 1;

  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1]);
    const curr = new Date(uniqueDates[i]);
    const diffMs = curr.getTime() - prev.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      tempStreak++;
    } else {
      tempStreak = 1;
    }

    if (tempStreak > longestStreak) {
      longestStreak = tempStreak;
    }
  }

  // Current streak: check if the last date is today or yesterday
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const lastDate = uniqueDates[uniqueDates.length - 1];

  if (lastDate === todayStr || lastDate === yesterdayStr) {
    // Count backwards from the last date
    currentStreak = 1;
    for (let i = uniqueDates.length - 2; i >= 0; i--) {
      const prev = new Date(uniqueDates[i]);
      const curr = new Date(uniqueDates[i + 1]);
      const diffMs = curr.getTime() - prev.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  } else {
    currentStreak = 0;
  }

  return {
    totalCheckInDays,
    currentStreak,
    longestStreak,
    totalMealRecords,
  };
}

/**
 * Validate profile edit input.
 * Requirement 16.1: Allow editing nickname, avatar, basic info
 * Requirement 2.4: Height 100-250cm
 * Requirement 2.5: Weight 30-300kg
 * Requirement 2.6: Age 10-120
 */
export function validateEditProfile(input: EditProfileInput): EditProfileValidation {
  const errors: Record<string, string> = {};

  // Nickname validation
  if (!input.nickname || input.nickname.trim().length < NICKNAME_MIN_LENGTH) {
    errors.nickname = '昵称不能为空';
  } else if (input.nickname.trim().length > NICKNAME_MAX_LENGTH) {
    errors.nickname = `昵称不能超过${NICKNAME_MAX_LENGTH}个字符`;
  }

  // Height validation
  if (!Number.isFinite(input.height) || input.height < HEIGHT_MIN || input.height > HEIGHT_MAX) {
    errors.height = `身高需在${HEIGHT_MIN}-${HEIGHT_MAX}厘米之间`;
  }

  // Weight validation
  if (!Number.isFinite(input.weight) || input.weight < WEIGHT_MIN || input.weight > WEIGHT_MAX) {
    errors.weight = `体重需在${WEIGHT_MIN}-${WEIGHT_MAX}公斤之间`;
  }

  // Target weight validation
  if (!Number.isFinite(input.targetWeight) || input.targetWeight < WEIGHT_MIN || input.targetWeight > WEIGHT_MAX) {
    errors.targetWeight = `目标体重需在${WEIGHT_MIN}-${WEIGHT_MAX}公斤之间`;
  }

  // Age validation
  if (!Number.isFinite(input.age) || !Number.isInteger(input.age) || input.age < AGE_MIN || input.age > AGE_MAX) {
    errors.age = `年龄需在${AGE_MIN}-${AGE_MAX}岁之间`;
  }

  // Gender validation
  const validGenders: Gender[] = ['male', 'female', 'other'];
  if (!validGenders.includes(input.gender)) {
    errors.gender = '请选择有效的性别';
  }

  // Activity level validation
  const validLevels: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
  if (!validLevels.includes(input.activityLevel)) {
    errors.activityLevel = '请选择有效的活动量';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Generate invite info for a user.
 * Requirement 16.5: Invite friends functionality
 */
export function generateInviteInfo(userId: string, baseUrl: string): InviteInfo {
  // Generate a simple invite code from userId
  const inviteCode = userId.replace(/-/g, '').slice(0, 8).toUpperCase();
  const inviteLink = `${baseUrl}/invite?code=${inviteCode}`;
  const inviteMessage = `我在用「吃了么」记录饮食，AI拍照识别热量超方便！完成挑战还能赚钱💰 快来加入吧！${inviteLink}`;

  return {
    inviteCode,
    inviteLink,
    inviteMessage,
  };
}

/**
 * Get display label for membership tier.
 */
export function getMembershipLabel(tier: string): string {
  switch (tier) {
    case 'monthly':
    case 'yearly':
      return '尊享会员';
    case 'free':
    default:
      return '免费版';
  }
}

/**
 * Get display label for gender.
 */
export function getGenderLabel(gender: Gender): string {
  switch (gender) {
    case 'male':
      return '男';
    case 'female':
      return '女';
    case 'other':
      return '其他';
    default:
      return '未知';
  }
}

/**
 * Get display label for activity level.
 */
export function getActivityLevelLabel(level: ActivityLevel): string {
  switch (level) {
    case 'sedentary':
      return '久坐';
    case 'light':
      return '轻度活动';
    case 'moderate':
      return '中度活动';
    case 'active':
      return '高度活动';
    case 'very_active':
      return '极高活动';
    default:
      return '未知';
  }
}

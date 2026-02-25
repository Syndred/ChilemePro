/**
 * Pure membership business logic — no side effects, fully testable.
 *
 * Requirement 22.1: Free tier features: basic meal recording, manual food add, basic calorie stats
 * Requirement 22.2: Premium features: unlimited AI photo, full chart analysis, no ads, priority review, exclusive food library
 * Requirement 22.3: Free users limited to 3 AI photo uses per day
 * Requirement 22.4: Prompt upgrade when free user exceeds limit
 * Requirement 22.5: Support monthly and yearly subscriptions
 * Requirement 22.6: Display membership benefits comparison page
 * Requirement 22.7: Unlock all premium features immediately upon subscription
 */

import type { MembershipTier } from '@/types';
import { MEMBERSHIP_PRICES } from './payment';

// --- Constants ---

/** Maximum AI photo uses per day for free users */
export const FREE_AI_PHOTO_DAILY_LIMIT = 3;

/** Features available in free tier */
export const FREE_FEATURES = [
  '基础饮食记录',
  '手动添加食物',
  '基础热量统计',
  'AI 拍照识别（每日 3 次）',
] as const;

/** Features available in premium tier */
export const PREMIUM_FEATURES = [
  '无限次 AI 拍照识别',
  '完整图表分析',
  '无广告体验',
  '挑战优先审核',
  '专属食物库',
  '基础饮食记录',
  '手动添加食物',
  '基础热量统计',
] as const;

/** Membership plan details */
export const MEMBERSHIP_PLANS = {
  monthly: {
    id: 'monthly' as const,
    name: '月度会员',
    price: MEMBERSHIP_PRICES.monthly,
    period: '月',
    pricePerMonth: MEMBERSHIP_PRICES.monthly,
  },
  yearly: {
    id: 'yearly' as const,
    name: '年度会员',
    price: MEMBERSHIP_PRICES.yearly,
    period: '年',
    pricePerMonth: Math.round((MEMBERSHIP_PRICES.yearly / 12) * 100) / 100,
  },
} as const;

// --- Types ---

export interface MembershipStatus {
  tier: MembershipTier;
  isPremium: boolean;
  expiresAt: Date | null;
  isExpired: boolean;
}

export interface AiPhotoUsageResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
  reason?: string;
}

// --- Pure Functions ---

/**
 * Check if a membership tier is premium (non-free).
 */
export function isPremiumTier(tier: MembershipTier): boolean {
  return tier === 'monthly' || tier === 'yearly';
}

/**
 * Check if a membership has expired.
 * Free tier never expires. Premium tiers expire based on expiresAt date.
 */
export function isMembershipExpired(
  tier: MembershipTier,
  expiresAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (tier === 'free') return false;
  if (!expiresAt) return true;
  return now > expiresAt;
}

/**
 * Get the effective membership status considering expiration.
 * If a premium membership has expired, the effective tier is 'free'.
 */
export function getEffectiveMembershipStatus(
  tier: MembershipTier,
  expiresAt: Date | null,
  now: Date = new Date(),
): MembershipStatus {
  const expired = isMembershipExpired(tier, expiresAt, now);
  const effectiveTier = expired && tier !== 'free' ? 'free' : tier;

  return {
    tier: effectiveTier,
    isPremium: isPremiumTier(effectiveTier),
    expiresAt,
    isExpired: expired && tier !== 'free',
  };
}

/**
 * Check if a free user can use AI photo recognition.
 * Requirement 22.3: Free users limited to 3 AI photo uses per day.
 * Requirement 22.4: Prompt upgrade when exceeding limit.
 *
 * @param tier - User's membership tier
 * @param expiresAt - Membership expiration date
 * @param dailyUsageCount - Number of AI photo uses today
 * @param now - Current time (for testing)
 */
export function checkAiPhotoUsage(
  tier: MembershipTier,
  expiresAt: Date | null,
  dailyUsageCount: number,
  now: Date = new Date(),
): AiPhotoUsageResult {
  const status = getEffectiveMembershipStatus(tier, expiresAt, now);

  // Premium users have unlimited access
  if (status.isPremium) {
    return {
      allowed: true,
      remaining: Infinity,
      limit: Infinity,
      used: dailyUsageCount,
    };
  }

  // Free users: check daily limit
  const remaining = Math.max(0, FREE_AI_PHOTO_DAILY_LIMIT - dailyUsageCount);
  const allowed = dailyUsageCount < FREE_AI_PHOTO_DAILY_LIMIT;

  return {
    allowed,
    remaining,
    limit: FREE_AI_PHOTO_DAILY_LIMIT,
    used: dailyUsageCount,
    reason: allowed ? undefined : '今日 AI 拍照次数已用完，升级会员享无限次使用',
  };
}

/**
 * Calculate the savings percentage for yearly vs monthly plan.
 */
export function getYearlySavingsPercent(): number {
  const monthlyTotal = MEMBERSHIP_PRICES.monthly * 12;
  const yearlyTotal = MEMBERSHIP_PRICES.yearly;
  return Math.round(((monthlyTotal - yearlyTotal) / monthlyTotal) * 100);
}

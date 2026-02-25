import { describe, it, expect } from 'vitest';
import {
  isPremiumTier,
  isMembershipExpired,
  getEffectiveMembershipStatus,
  checkAiPhotoUsage,
  getYearlySavingsPercent,
  FREE_AI_PHOTO_DAILY_LIMIT,
  MEMBERSHIP_PLANS,
} from './membership';

// --- isPremiumTier ---

describe('isPremiumTier', () => {
  it('returns false for free tier', () => {
    expect(isPremiumTier('free')).toBe(false);
  });

  it('returns true for monthly tier', () => {
    expect(isPremiumTier('monthly')).toBe(true);
  });

  it('returns true for yearly tier', () => {
    expect(isPremiumTier('yearly')).toBe(true);
  });
});

// --- isMembershipExpired ---

describe('isMembershipExpired', () => {
  it('free tier never expires', () => {
    expect(isMembershipExpired('free', null)).toBe(false);
    expect(isMembershipExpired('free', new Date('2020-01-01'))).toBe(false);
  });

  it('premium tier with null expiresAt is expired', () => {
    expect(isMembershipExpired('monthly', null)).toBe(true);
  });

  it('premium tier with future date is not expired', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(isMembershipExpired('monthly', future)).toBe(false);
  });

  it('premium tier with past date is expired', () => {
    const past = new Date('2020-01-01');
    expect(isMembershipExpired('yearly', past)).toBe(true);
  });
});

// --- getEffectiveMembershipStatus ---

describe('getEffectiveMembershipStatus', () => {
  it('free user stays free', () => {
    const status = getEffectiveMembershipStatus('free', null);
    expect(status.tier).toBe('free');
    expect(status.isPremium).toBe(false);
    expect(status.isExpired).toBe(false);
  });

  it('active premium user is premium', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const status = getEffectiveMembershipStatus('monthly', future);
    expect(status.tier).toBe('monthly');
    expect(status.isPremium).toBe(true);
    expect(status.isExpired).toBe(false);
  });

  it('expired premium user falls back to free', () => {
    const past = new Date('2020-01-01');
    const status = getEffectiveMembershipStatus('yearly', past);
    expect(status.tier).toBe('free');
    expect(status.isPremium).toBe(false);
    expect(status.isExpired).toBe(true);
  });
});

// --- checkAiPhotoUsage ---

describe('checkAiPhotoUsage', () => {
  const now = new Date('2025-06-01T12:00:00Z');
  const futureExpiry = new Date('2026-01-01');

  it('premium user always allowed', () => {
    const result = checkAiPhotoUsage('monthly', futureExpiry, 100, now);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(Infinity);
    expect(result.limit).toBe(Infinity);
  });

  it('free user with 0 uses is allowed', () => {
    const result = checkAiPhotoUsage('free', null, 0, now);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(FREE_AI_PHOTO_DAILY_LIMIT);
    expect(result.used).toBe(0);
  });

  it('free user with 2 uses has 1 remaining', () => {
    const result = checkAiPhotoUsage('free', null, 2, now);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it('free user at limit is denied', () => {
    const result = checkAiPhotoUsage('free', null, FREE_AI_PHOTO_DAILY_LIMIT, now);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain('升级会员');
  });

  it('free user over limit is denied', () => {
    const result = checkAiPhotoUsage('free', null, 10, now);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('expired premium user treated as free', () => {
    const pastExpiry = new Date('2020-01-01');
    const result = checkAiPhotoUsage('monthly', pastExpiry, FREE_AI_PHOTO_DAILY_LIMIT, now);
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(FREE_AI_PHOTO_DAILY_LIMIT);
  });
});

// --- getYearlySavingsPercent ---

describe('getYearlySavingsPercent', () => {
  it('returns a positive savings percentage', () => {
    const savings = getYearlySavingsPercent();
    expect(savings).toBeGreaterThan(0);
    expect(savings).toBeLessThan(100);
  });

  it('yearly is cheaper per month than monthly', () => {
    expect(MEMBERSHIP_PLANS.yearly.pricePerMonth).toBeLessThan(MEMBERSHIP_PLANS.monthly.price);
  });
});

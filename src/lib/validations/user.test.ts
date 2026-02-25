import { describe, it, expect } from 'vitest';
import { userProfileSchema, userProfileInputSchema } from './user';

const validProfile = {
  nickname: '测试用户',
  avatar: 'https://example.com/avatar.jpg',
  height: 170,
  weight: 65,
  targetWeight: 60,
  age: 25,
  gender: 'male' as const,
  activityLevel: 'moderate' as const,
};

describe('userProfileSchema', () => {
  it('accepts valid profile data', () => {
    const result = userProfileSchema.safeParse(validProfile);
    expect(result.success).toBe(true);
  });

  // Height validation: 100-250cm (Requirement 2.4)
  describe('height validation (100-250cm)', () => {
    it('rejects height below 100cm', () => {
      const result = userProfileSchema.safeParse({ ...validProfile, height: 99 });
      expect(result.success).toBe(false);
    });

    it('accepts height at 100cm boundary', () => {
      const result = userProfileSchema.safeParse({ ...validProfile, height: 100 });
      expect(result.success).toBe(true);
    });

    it('accepts height at 250cm boundary', () => {
      const result = userProfileSchema.safeParse({ ...validProfile, height: 250 });
      expect(result.success).toBe(true);
    });

    it('rejects height above 250cm', () => {
      const result = userProfileSchema.safeParse({ ...validProfile, height: 251 });
      expect(result.success).toBe(false);
    });
  });

  // Weight validation: 30-300kg (Requirement 2.5)
  describe('weight validation (30-300kg)', () => {
    it('rejects weight below 30kg', () => {
      const result = userProfileSchema.safeParse({ ...validProfile, weight: 29 });
      expect(result.success).toBe(false);
    });

    it('accepts weight at 30kg boundary', () => {
      const result = userProfileSchema.safeParse({ ...validProfile, weight: 30 });
      expect(result.success).toBe(true);
    });

    it('accepts weight at 300kg boundary', () => {
      const result = userProfileSchema.safeParse({ ...validProfile, weight: 300 });
      expect(result.success).toBe(true);
    });

    it('rejects weight above 300kg', () => {
      const result = userProfileSchema.safeParse({ ...validProfile, weight: 301 });
      expect(result.success).toBe(false);
    });
  });

  // Age validation: 10-120 (Requirement 2.6)
  describe('age validation (10-120)', () => {
    it('rejects age below 10', () => {
      const result = userProfileSchema.safeParse({ ...validProfile, age: 9 });
      expect(result.success).toBe(false);
    });

    it('accepts age at 10 boundary', () => {
      const result = userProfileSchema.safeParse({ ...validProfile, age: 10 });
      expect(result.success).toBe(true);
    });

    it('accepts age at 120 boundary', () => {
      const result = userProfileSchema.safeParse({ ...validProfile, age: 120 });
      expect(result.success).toBe(true);
    });

    it('rejects age above 120', () => {
      const result = userProfileSchema.safeParse({ ...validProfile, age: 121 });
      expect(result.success).toBe(false);
    });

    it('rejects non-integer age', () => {
      const result = userProfileSchema.safeParse({ ...validProfile, age: 25.5 });
      expect(result.success).toBe(false);
    });
  });

  // Nickname validation
  it('rejects empty nickname', () => {
    const result = userProfileSchema.safeParse({ ...validProfile, nickname: '' });
    expect(result.success).toBe(false);
  });

  // Gender validation
  it('rejects invalid gender', () => {
    const result = userProfileSchema.safeParse({ ...validProfile, gender: 'invalid' });
    expect(result.success).toBe(false);
  });

  // Activity level validation
  it('rejects invalid activity level', () => {
    const result = userProfileSchema.safeParse({ ...validProfile, activityLevel: 'invalid' });
    expect(result.success).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  generateVerificationCode,
  isValidPhone,
  isPhoneLocked,
  getLockoutRemainingMs,
  canSendCode,
  createVerificationAttempt,
  verifyCode,
  VERIFICATION_CODE_LENGTH,
  VERIFICATION_CODE_EXPIRY_MS,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS,
  type LockoutState,
  type VerificationAttempt,
} from './verification-code';

describe('generateVerificationCode', () => {
  it('should generate a 6-digit string', () => {
    const code = generateVerificationCode();
    expect(code).toHaveLength(VERIFICATION_CODE_LENGTH);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  it('should generate different codes on successive calls', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateVerificationCode()));
    // With 6-digit codes, 20 calls should produce at least 2 unique values
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('isValidPhone', () => {
  it('should accept valid Chinese mobile numbers', () => {
    expect(isValidPhone('13800138000')).toBe(true);
    expect(isValidPhone('15912345678')).toBe(true);
    expect(isValidPhone('18600001111')).toBe(true);
  });

  it('should reject invalid phone numbers', () => {
    expect(isValidPhone('12345678901')).toBe(false); // starts with 12
    expect(isValidPhone('1380013800')).toBe(false);  // too short
    expect(isValidPhone('138001380001')).toBe(false); // too long
    expect(isValidPhone('abcdefghijk')).toBe(false);
    expect(isValidPhone('')).toBe(false);
  });
});

describe('isPhoneLocked', () => {
  const now = 1000000;

  it('should return false when lockoutState is null', () => {
    expect(isPhoneLocked(null, now)).toBe(false);
  });

  it('should return false when lockedUntil is null', () => {
    const state: LockoutState = {
      phone: '13800138000',
      failedAttempts: 2,
      lockedUntil: null,
      lastAttemptAt: now - 1000,
    };
    expect(isPhoneLocked(state, now)).toBe(false);
  });

  it('should return true when lock has not expired', () => {
    const state: LockoutState = {
      phone: '13800138000',
      failedAttempts: 3,
      lockedUntil: now + 60000,
      lastAttemptAt: now - 1000,
    };
    expect(isPhoneLocked(state, now)).toBe(true);
  });

  it('should return false when lock has expired', () => {
    const state: LockoutState = {
      phone: '13800138000',
      failedAttempts: 3,
      lockedUntil: now - 1,
      lastAttemptAt: now - 60000,
    };
    expect(isPhoneLocked(state, now)).toBe(false);
  });
});

describe('canSendCode', () => {
  it('should allow sending when no lockout state', () => {
    expect(canSendCode(null, Date.now())).toEqual({ success: true });
  });

  it('should block sending when phone is locked', () => {
    const now = 1000000;
    const state: LockoutState = {
      phone: '13800138000',
      failedAttempts: 3,
      lockedUntil: now + LOCKOUT_DURATION_MS,
      lastAttemptAt: now,
    };
    const result = canSendCode(state, now);
    expect(result.success).toBe(false);
    expect(result.error).toBe('phone_locked');
    expect(result.lockoutRemainingMs).toBeGreaterThan(0);
  });
});

describe('createVerificationAttempt', () => {
  it('should create an attempt with correct expiry', () => {
    const now = 1000000;
    const attempt = createVerificationAttempt('13800138000', '123456', now);
    expect(attempt.phone).toBe('13800138000');
    expect(attempt.code).toBe('123456');
    expect(attempt.sentAt).toBe(now);
    expect(attempt.expiresAt).toBe(now + VERIFICATION_CODE_EXPIRY_MS);
  });
});

describe('verifyCode', () => {
  const now = 1000000;
  const phone = '13800138000';
  const code = '123456';

  const makeAttempt = (overrides?: Partial<VerificationAttempt>): VerificationAttempt => ({
    phone,
    code,
    sentAt: now - 1000,
    expiresAt: now + VERIFICATION_CODE_EXPIRY_MS,
    ...overrides,
  });

  it('should succeed with correct code', () => {
    const attempt = makeAttempt();
    const { result, newLockoutState } = verifyCode(attempt, code, null, now);
    expect(result.success).toBe(true);
    expect(newLockoutState.failedAttempts).toBe(0);
    expect(newLockoutState.lockedUntil).toBeNull();
  });

  it('should fail with wrong code and decrement remaining attempts', () => {
    const attempt = makeAttempt();
    const { result, newLockoutState } = verifyCode(attempt, '000000', null, now);
    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_code');
    expect(result.remainingAttempts).toBe(MAX_FAILED_ATTEMPTS - 1);
    expect(newLockoutState.failedAttempts).toBe(1);
  });

  it('should lock after 3 consecutive wrong attempts', () => {
    const attempt = makeAttempt();
    let lockout: LockoutState | null = null;

    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      const { result, newLockoutState } = verifyCode(attempt, '000000', lockout, now);
      lockout = newLockoutState;

      if (i < MAX_FAILED_ATTEMPTS - 1) {
        expect(result.error).toBe('invalid_code');
      } else {
        expect(result.error).toBe('phone_locked');
        expect(newLockoutState.lockedUntil).toBe(now + LOCKOUT_DURATION_MS);
      }
    }
  });

  it('should reject when phone is locked', () => {
    const attempt = makeAttempt();
    const lockout: LockoutState = {
      phone,
      failedAttempts: 3,
      lockedUntil: now + LOCKOUT_DURATION_MS,
      lastAttemptAt: now,
    };
    const { result } = verifyCode(attempt, code, lockout, now);
    expect(result.success).toBe(false);
    expect(result.error).toBe('phone_locked');
  });

  it('should allow login after lockout expires', () => {
    const afterLockout = now + LOCKOUT_DURATION_MS + 1;
    const attempt: VerificationAttempt = {
      phone,
      code,
      sentAt: afterLockout - 1000,
      expiresAt: afterLockout + VERIFICATION_CODE_EXPIRY_MS,
    };
    const lockout: LockoutState = {
      phone,
      failedAttempts: 3,
      lockedUntil: now + LOCKOUT_DURATION_MS,
      lastAttemptAt: now,
    };
    const { result } = verifyCode(attempt, code, lockout, afterLockout);
    expect(result.success).toBe(true);
  });

  it('should fail with expired code', () => {
    const attempt = makeAttempt({ expiresAt: now - 1 });
    const { result } = verifyCode(attempt, code, null, now);
    expect(result.success).toBe(false);
    expect(result.error).toBe('expired_code');
  });

  it('should fail when no code was sent', () => {
    const { result } = verifyCode(null, code, null, now);
    expect(result.success).toBe(false);
    expect(result.error).toBe('no_code_sent');
  });

  it('should reset lockout state on successful verification', () => {
    const attempt = makeAttempt();
    const lockout: LockoutState = {
      phone,
      failedAttempts: 2,
      lockedUntil: null,
      lastAttemptAt: now - 1000,
    };
    const { result, newLockoutState } = verifyCode(attempt, code, lockout, now);
    expect(result.success).toBe(true);
    expect(newLockoutState.failedAttempts).toBe(0);
    expect(newLockoutState.lockedUntil).toBeNull();
  });
});

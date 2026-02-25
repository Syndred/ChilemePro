/**
 * 验证码服务 - 纯函数实现，可独立测试
 * 
 * 实现验证码发送、验证、错误计数和锁定逻辑
 * Requirements: 1.1, 1.2, 1.4
 */

// --- Types ---

export interface VerificationAttempt {
  phone: string;
  code: string;
  sentAt: number;       // timestamp ms
  expiresAt: number;    // timestamp ms
}

export interface LockoutState {
  phone: string;
  failedAttempts: number;
  lockedUntil: number | null;  // timestamp ms, null = not locked
  lastAttemptAt: number | null;
}

export interface VerifyResult {
  success: boolean;
  error?: 'invalid_code' | 'expired_code' | 'phone_locked' | 'no_code_sent';
  remainingAttempts?: number;
  lockoutMinutes?: number;
}

export interface SendCodeResult {
  success: boolean;
  error?: 'phone_locked' | 'rate_limited';
  lockoutRemainingMs?: number;
}

// --- Constants ---

export const VERIFICATION_CODE_LENGTH = 6;
export const VERIFICATION_CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_FAILED_ATTEMPTS = 3;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// --- Pure Functions ---

/**
 * Generate a random 6-digit verification code
 */
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Validate phone number format (Chinese mobile)
 */
export function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}

/**
 * Check if a phone number is currently locked out
 */
export function isPhoneLocked(lockoutState: LockoutState | null, now: number): boolean {
  if (!lockoutState) return false;
  if (lockoutState.lockedUntil === null) return false;
  return now < lockoutState.lockedUntil;
}

/**
 * Get remaining lockout time in milliseconds
 */
export function getLockoutRemainingMs(lockoutState: LockoutState | null, now: number): number {
  if (!lockoutState || lockoutState.lockedUntil === null) return 0;
  return Math.max(0, lockoutState.lockedUntil - now);
}

/**
 * Check if we can send a verification code to this phone
 */
export function canSendCode(
  lockoutState: LockoutState | null,
  now: number
): SendCodeResult {
  if (isPhoneLocked(lockoutState, now)) {
    return {
      success: false,
      error: 'phone_locked',
      lockoutRemainingMs: getLockoutRemainingMs(lockoutState, now),
    };
  }
  return { success: true };
}

/**
 * Create a new verification attempt record
 */
export function createVerificationAttempt(
  phone: string,
  code: string,
  now: number
): VerificationAttempt {
  return {
    phone,
    code,
    sentAt: now,
    expiresAt: now + VERIFICATION_CODE_EXPIRY_MS,
  };
}

/**
 * Verify a code against the stored attempt.
 * Returns the result and the updated lockout state.
 */
export function verifyCode(
  attempt: VerificationAttempt | null,
  inputCode: string,
  lockoutState: LockoutState | null,
  now: number
): { result: VerifyResult; newLockoutState: LockoutState } {
  const phone = attempt?.phone ?? lockoutState?.phone ?? '';

  // Initialize lockout state if needed
  const currentLockout: LockoutState = lockoutState ?? {
    phone,
    failedAttempts: 0,
    lockedUntil: null,
    lastAttemptAt: null,
  };

  // Check if phone is locked
  if (isPhoneLocked(currentLockout, now)) {
    return {
      result: {
        success: false,
        error: 'phone_locked',
        lockoutMinutes: Math.ceil(getLockoutRemainingMs(currentLockout, now) / 60000),
      },
      newLockoutState: currentLockout,
    };
  }

  // No code was sent
  if (!attempt) {
    return {
      result: { success: false, error: 'no_code_sent' },
      newLockoutState: currentLockout,
    };
  }

  // Code expired
  if (now > attempt.expiresAt) {
    return {
      result: { success: false, error: 'expired_code' },
      newLockoutState: currentLockout,
    };
  }

  // Code matches — success, reset lockout
  if (attempt.code === inputCode) {
    return {
      result: { success: true },
      newLockoutState: {
        phone: currentLockout.phone,
        failedAttempts: 0,
        lockedUntil: null,
        lastAttemptAt: now,
      },
    };
  }

  // Wrong code — increment failed attempts
  const newFailedAttempts = currentLockout.failedAttempts + 1;
  const shouldLock = newFailedAttempts >= MAX_FAILED_ATTEMPTS;

  const newLockoutState: LockoutState = {
    phone: currentLockout.phone,
    failedAttempts: newFailedAttempts,
    lockedUntil: shouldLock ? now + LOCKOUT_DURATION_MS : currentLockout.lockedUntil,
    lastAttemptAt: now,
  };

  if (shouldLock) {
    return {
      result: {
        success: false,
        error: 'phone_locked',
        lockoutMinutes: Math.ceil(LOCKOUT_DURATION_MS / 60000),
      },
      newLockoutState,
    };
  }

  return {
    result: {
      success: false,
      error: 'invalid_code',
      remainingAttempts: MAX_FAILED_ATTEMPTS - newFailedAttempts,
    },
    newLockoutState,
  };
}

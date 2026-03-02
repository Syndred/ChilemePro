'use server';

import { createClient } from '@/lib/supabase/server';
import { sendCodeSchema, verifyCodeSchema } from '@/lib/validations/auth';
import {
  canSendCode,
  createVerificationAttempt,
  generateVerificationCode,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS,
  type LockoutState,
  type VerificationAttempt,
} from '@/lib/services/verification-code';

const verificationStore = new Map<string, VerificationAttempt>();
const lockoutStore = new Map<string, LockoutState>();

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

function getLockoutState(phone: string): LockoutState {
  return (
    lockoutStore.get(phone) ?? {
      phone,
      failedAttempts: 0,
      lockedUntil: null,
      lastAttemptAt: null,
    }
  );
}

export async function sendVerificationCode(
  formData: { phone: string },
): Promise<ActionResult<{ codeSent: boolean }>> {
  const parsed = sendCodeSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { phone } = parsed.data;
  const now = Date.now();
  const sendCheck = canSendCode(lockoutStore.get(phone) ?? null, now);

  if (!sendCheck.success) {
    const remainingMin = Math.ceil((sendCheck.lockoutRemainingMs ?? 0) / 60000);
    return {
      success: false,
      error: `Phone is locked. Try again in ${remainingMin} minutes.`,
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: true },
    });

    if (error) {
      return {
        success: false,
        error: 'Failed to send SMS code. Check Supabase phone auth configuration.',
      };
    }
  } catch {
    return { success: false, error: 'Failed to send SMS code. Please retry.' };
  }

  const code = generateVerificationCode();
  verificationStore.set(phone, createVerificationAttempt(phone, code, now));

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DEV] Verification code for ${phone}: ${code}`);
  }

  return { success: true, data: { codeSent: true } };
}

export async function verifyAndLogin(
  formData: { phone: string; code: string },
): Promise<ActionResult<{ userId: string; isNewUser: boolean }>> {
  const parsed = verifyCodeSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { phone, code } = parsed.data;
  const now = Date.now();
  const lockoutState = getLockoutState(phone);

  if (lockoutState.lockedUntil && now < lockoutState.lockedUntil) {
    const remainingMin = Math.ceil((lockoutState.lockedUntil - now) / 60000);
    return {
      success: false,
      error: `Phone is locked. Try again in ${remainingMin} minutes.`,
    };
  }

  try {
    const supabase = await createClient();
    const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
      phone,
      token: code,
      type: 'sms',
    });

    if (otpError || !otpData.user) {
      const failedAttempts = lockoutState.failedAttempts + 1;
      const shouldLock = failedAttempts >= MAX_FAILED_ATTEMPTS;

      lockoutStore.set(phone, {
        phone,
        failedAttempts,
        lockedUntil: shouldLock ? now + LOCKOUT_DURATION_MS : null,
        lastAttemptAt: now,
      });

      if (shouldLock) {
        return {
          success: false,
          error: `Too many invalid attempts. Locked for ${Math.ceil(LOCKOUT_DURATION_MS / 60000)} minutes.`,
        };
      }

      return {
        success: false,
        error: `Invalid code. ${MAX_FAILED_ATTEMPTS - failedAttempts} attempts left.`,
      };
    }

    lockoutStore.set(phone, {
      phone,
      failedAttempts: 0,
      lockedUntil: null,
      lastAttemptAt: now,
    });
    verificationStore.delete(phone);

    const authUser = otpData.user;
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, phone')
      .eq('id', authUser.id)
      .maybeSingle();

    if (existingUser) {
      if (!existingUser.phone) {
        await supabase
          .from('users')
          .update({
            phone,
            updated_at: new Date().toISOString(),
          })
          .eq('id', authUser.id);
      }

      return {
        success: true,
        data: { userId: authUser.id, isNewUser: false },
      };
    }

    const { error: insertError } = await supabase.from('users').insert({
      id: authUser.id,
      phone,
      nickname: `User${phone.slice(-4)}`,
      membership_tier: 'free',
    });

    if (insertError) {
      if (insertError.code === '23505') {
        return {
          success: false,
          error: 'Account profile conflict detected. Please contact support to reconcile legacy data.',
        };
      }
      return { success: false, error: 'Failed to create user profile.' };
    }

    return {
      success: true,
      data: { userId: authUser.id, isNewUser: true },
    };
  } catch {
    return { success: false, error: 'Server error. Please retry.' };
  }
}

export async function initiateWeChatLogin(): Promise<
  ActionResult<{ authUrl: string; state: string }>
> {
  return {
    success: false,
    error: 'WeChat login is temporarily disabled. Please use phone OTP login.',
  };
}

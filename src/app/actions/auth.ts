'use server';

import { createClient } from '@/lib/supabase/server';
import { sendCodeSchema, verifyCodeSchema } from '@/lib/validations/auth';
import {
  canSendCode,
  createVerificationAttempt,
  generateVerificationCode,
  verifyCode,
  isValidPhone,
  type LockoutState,
  type VerificationAttempt,
} from '@/lib/services/verification-code';

// In-memory store for verification codes and lockout state.
// In production, use Redis or a database table.
const verificationStore = new Map<string, VerificationAttempt>();
const lockoutStore = new Map<string, LockoutState>();

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Send verification code to phone number
 * Requirement 1.1: System sends verification code to user's phone
 */
export async function sendVerificationCode(
  formData: { phone: string }
): Promise<ActionResult<{ codeSent: boolean }>> {
  // Validate input
  const parsed = sendCodeSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }

  const { phone } = parsed.data;
  const now = Date.now();

  // Check lockout
  const lockoutState = lockoutStore.get(phone) ?? null;
  const sendCheck = canSendCode(lockoutState, now);

  if (!sendCheck.success) {
    const remainingMin = Math.ceil((sendCheck.lockoutRemainingMs ?? 0) / 60000);
    return {
      success: false,
      error: `手机号已被锁定，请 ${remainingMin} 分钟后再试`,
    };
  }

  // Generate and store code
  const code = generateVerificationCode();
  const attempt = createVerificationAttempt(phone, code, now);
  verificationStore.set(phone, attempt);

  // In production: send SMS via provider (e.g., Twilio, Aliyun SMS)
  // For development, log the code
  console.log(`[DEV] Verification code for ${phone}: ${code}`);

  // Also try to send via Supabase Auth OTP if configured
  try {
    const supabase = await createClient();
    await supabase.auth.signInWithOtp({ phone });
  } catch {
    // Supabase OTP is optional; in-memory code is the primary mechanism
  }

  return { success: true, data: { codeSent: true } };
}

/**
 * Verify code and log in user
 * Requirement 1.2: System creates or logs in user account on correct code
 * Requirement 1.4: Lock phone for 15 minutes after 3 wrong attempts
 */
export async function verifyAndLogin(
  formData: { phone: string; code: string }
): Promise<ActionResult<{ userId: string; isNewUser: boolean }>> {
  // Validate input
  const parsed = verifyCodeSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }

  const { phone, code } = parsed.data;
  const now = Date.now();

  // Get stored attempt and lockout state
  const attempt = verificationStore.get(phone) ?? null;
  const lockoutState = lockoutStore.get(phone) ?? null;

  // Verify code using pure function
  const { result, newLockoutState } = verifyCode(attempt, code, lockoutState, now);

  // Update lockout state
  lockoutStore.set(phone, newLockoutState);

  if (!result.success) {
    let errorMsg: string;
    switch (result.error) {
      case 'phone_locked':
        errorMsg = `手机号已被锁定，请 ${result.lockoutMinutes} 分钟后再试`;
        break;
      case 'expired_code':
        errorMsg = '验证码已过期，请重新获取';
        break;
      case 'no_code_sent':
        errorMsg = '请先获取验证码';
        break;
      case 'invalid_code':
        errorMsg = `验证码错误，还剩 ${result.remainingAttempts} 次机会`;
        break;
      default:
        errorMsg = '验证失败';
    }
    return { success: false, error: errorMsg };
  }

  // Code verified — clean up
  verificationStore.delete(phone);

  // Create or get user via Supabase
  try {
    const supabase = await createClient();

    // Try to sign in with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithOtp({
      phone,
    });

    if (authError) {
      console.error('Supabase auth error:', authError);
    }

    // Check if user exists in our users table
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('phone', phone)
      .single();

    if (existingUser) {
      return {
        success: true,
        data: { userId: existingUser.id, isNewUser: false },
      };
    }

    // Create new user
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        phone,
        nickname: `用户${phone.slice(-4)}`,
        membership_tier: 'free',
      })
      .select('id')
      .single();

    if (createError) {
      return { success: false, error: '创建用户失败，请重试' };
    }

    return {
      success: true,
      data: { userId: newUser.id, isNewUser: true },
    };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Initiate WeChat OAuth login
 * Requirement 1.3: WeChat OAuth authentication
 *
 * Returns the WeChat authorization URL for the client to redirect to.
 */
export async function initiateWeChatLogin(
  baseUrl: string
): Promise<ActionResult<{ authUrl: string; state: string }>> {
  try {
    const { buildAuthorizationUrl, getWeChatConfig } = await import(
      '@/lib/services/wechat-oauth'
    );

    const config = getWeChatConfig(baseUrl);

    // Generate random state for CSRF protection
    const state = crypto.randomUUID();

    const authUrl = buildAuthorizationUrl(
      { appId: config.appId, redirectUri: config.redirectUri },
      state
    );

    return {
      success: true,
      data: { authUrl, state },
    };
  } catch (error) {
    console.error('WeChat login initiation error:', error);
    return {
      success: false,
      error: '微信登录初始化失败，请稍后重试',
    };
  }
}



/**
 * Initiate WeChat OAuth login
 * Requirement 1.3: WeChat OAuth authentication
 *
 * Returns the WeChat authorization URL for the client to redirect to.
 */
export async function initiateWeChatLogin(
  baseUrl: string
): Promise<ActionResult<{ authUrl: string; state: string }>> {
  try {
    const { buildAuthorizationUrl, getWeChatConfig } = await import(
      '@/lib/services/wechat-oauth'
    );

    const config = getWeChatConfig(baseUrl);

    // Generate random state for CSRF protection
    const state = crypto.randomUUID();

    const authUrl = buildAuthorizationUrl(
      { appId: config.appId, redirectUri: config.redirectUri },
      state
    );

    return {
      success: true,
      data: { authUrl, state },
    };
  } catch (error) {
    console.error('WeChat login initiation error:', error);
    return {
      success: false,
      error: '微信登录初始化失败，请稍后重试',
    };
  }
}

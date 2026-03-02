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

const LOCAL_TEST_ACCOUNTS = [
  { phone: '13800138000', code: '123456' },
  { phone: '13800138001', code: '123456' },
  { phone: '13800138002', code: '123456' },
] as const;

type SupabaseAuthErrorLike = {
  code?: string | null;
  message?: string | null;
} | null;

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

function normalizePhoneForSupabase(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) {
    return trimmed;
  }
  if (/^86\d{11}$/.test(trimmed)) {
    return `+${trimmed}`;
  }
  if (/^1[3-9]\d{9}$/.test(trimmed)) {
    return `+86${trimmed}`;
  }
  return trimmed;
}

function buildLocalTestHint(): string {
  const preview = LOCAL_TEST_ACCOUNTS.map((item) => `${item.phone} / ${item.code}`).join('、');
  return `本地测试可使用示例测试号：${preview}（输入 11 位手机号即可，系统会自动按 +86 处理）`;
}

function isPhoneProviderDisabled(error: SupabaseAuthErrorLike): boolean {
  if (!error) {
    return false;
  }

  const code = error.code?.toLowerCase() ?? '';
  const message = error.message?.toLowerCase() ?? '';
  return code === 'phone_provider_disabled' || message.includes('unsupported phone provider');
}

function mapSendCodeError(error: SupabaseAuthErrorLike): string {
  if (!error) {
    return '验证码发送失败，请稍后重试。';
  }

  if (isPhoneProviderDisabled(error)) {
    return `当前项目未开启短信服务（Supabase Phone Provider 已关闭）。请先在 Supabase 控制台开启 Phone Provider，或配置 Test OTP。${buildLocalTestHint()}`;
  }

  const code = error.code?.toLowerCase() ?? '';
  switch (code) {
    case 'over_sms_send_rate_limit':
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return '请求过于频繁，请稍后再试。';
    case 'sms_send_failed':
      return '短信发送失败，请稍后重试。';
    default:
      return '验证码发送失败，请稍后重试。';
  }
}

function mapVerifyError(error: SupabaseAuthErrorLike): string {
  if (!error) {
    return '验证码校验失败，请重试。';
  }

  if (isPhoneProviderDisabled(error)) {
    return `当前项目未开启短信服务（Supabase Phone Provider 已关闭），无法完成手机号登录。${buildLocalTestHint()}`;
  }

  const code = error.code?.toLowerCase() ?? '';
  switch (code) {
    case 'otp_expired':
      return '验证码无效或已过期，请重新获取。';
    case 'invalid_credentials':
      return '验证码不正确，请重试。';
    case 'over_request_rate_limit':
      return '请求过于频繁，请稍后再试。';
    default:
      return '验证码校验失败，请重试。';
  }
}

export async function sendVerificationCode(
  formData: { phone: string },
): Promise<ActionResult<{ codeSent: boolean }>> {
  const parsed = sendCodeSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { phone } = parsed.data;
  const supabasePhone = normalizePhoneForSupabase(phone);
  const now = Date.now();
  const sendCheck = canSendCode(lockoutStore.get(phone) ?? null, now);

  if (!sendCheck.success) {
    const remainingMin = Math.ceil((sendCheck.lockoutRemainingMs ?? 0) / 60000);
    return {
      success: false,
      error: `手机号已被临时锁定，请在 ${remainingMin} 分钟后重试。`,
    };
  }

  const code = generateVerificationCode();
  verificationStore.set(phone, createVerificationAttempt(phone, code, now));

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      phone: supabasePhone,
      options: { shouldCreateUser: true },
    });

    if (error) {
      return {
        success: false,
        error: mapSendCodeError(error),
      };
    }
  } catch {
    return { success: false, error: '验证码发送失败，请稍后重试。' };
  }

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
  const supabasePhone = normalizePhoneForSupabase(phone);
  const now = Date.now();
  const lockoutState = getLockoutState(phone);

  if (lockoutState.lockedUntil && now < lockoutState.lockedUntil) {
    const remainingMin = Math.ceil((lockoutState.lockedUntil - now) / 60000);
    return {
      success: false,
      error: `手机号已被临时锁定，请在 ${remainingMin} 分钟后重试。`,
    };
  }

  try {
    const supabase = await createClient();
    const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
      phone: supabasePhone,
      token: code,
      type: 'sms',
    });

    if (otpError || !otpData.user) {
      if (isPhoneProviderDisabled(otpError)) {
        return {
          success: false,
          error: mapVerifyError(otpError),
        };
      }

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
          error: `验证码错误次数过多，账号已锁定 ${Math.ceil(LOCKOUT_DURATION_MS / 60000)} 分钟。`,
        };
      }

      const remaining = MAX_FAILED_ATTEMPTS - failedAttempts;
      const mapped = mapVerifyError(otpError);
      return {
        success: false,
        error: `${mapped}（剩余 ${remaining} 次）`,
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
      nickname: `用户${phone.slice(-4)}`,
      membership_tier: 'free',
    });

    if (insertError) {
      if (insertError.code === '23505') {
        return {
          success: false,
          error: '账户资料冲突，请联系管理员处理。',
        };
      }
      return { success: false, error: '创建用户资料失败，请稍后重试。' };
    }

    return {
      success: true,
      data: { userId: authUser.id, isNewUser: true },
    };
  } catch {
    return { success: false, error: '服务暂时不可用，请稍后重试。' };
  }
}

export async function initiateWeChatLogin(): Promise<
  ActionResult<{ authUrl: string; state: string }>
> {
  return {
    success: false,
    error: '微信登录暂未开放，请先使用手机号验证码登录。',
  };
}

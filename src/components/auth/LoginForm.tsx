'use client';

import { useState, useCallback, useEffect, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, ShieldCheck, Loader2, AlertCircle, MessageCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  sendCodeSchema,
  verifyCodeSchema,
  type SendCodeFormValues,
  type VerifyCodeFormValues,
} from '@/lib/validations/auth';
import { sendVerificationCode, verifyAndLogin, initiateWeChatLogin } from '@/app/actions/auth';

interface LoginFormProps {
  onSuccess: (userId: string, isNewUser: boolean) => void;
  onError?: (error: string) => void;
}

const COUNTDOWN_SECONDS = 60;
const LOCAL_TEST_ACCOUNTS = [
  { phone: '13800138000', code: '123456', tag: '测试账号 A' },
  { phone: '13800138001', code: '123456', tag: '测试账号 B' },
  { phone: '13800138002', code: '123456', tag: '测试账号 C' },
] as const;

export function LoginForm({ onSuccess, onError }: LoginFormProps) {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showManualCodeEntry, setShowManualCodeEntry] = useState(false);
  const [isPending, startTransition] = useTransition();

  const phoneForm = useForm<SendCodeFormValues>({
    resolver: zodResolver(sendCodeSchema),
    defaultValues: { phone: '' },
  });

  const codeForm = useForm<VerifyCodeFormValues>({
    resolver: zodResolver(verifyCodeSchema),
    defaultValues: { phone: '', code: '' },
  });

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleWeChatLogin = useCallback(() => {
    setServerError(null);
    startTransition(async () => {
      const result = await initiateWeChatLogin();
      if (result.success && result.data) {
        document.cookie = `wechat_oauth_state=${result.data.state};path=/;max-age=600;samesite=lax`;
        window.location.href = result.data.authUrl;
      } else {
        const message = result.error ?? '微信登录失败，请稍后重试';
        setServerError(message);
        onError?.(message);
      }
    });
  }, [onError]);

  const handleSendCode = useCallback(
    (data: SendCodeFormValues) => {
      setServerError(null);
      setShowManualCodeEntry(false);
      startTransition(async () => {
        const result = await sendVerificationCode({ phone: data.phone });
        if (result.success) {
          setPhone(data.phone);
          codeForm.setValue('phone', data.phone);
          setStep('code');
          setCountdown(COUNTDOWN_SECONDS);
          return;
        }

        const message = result.error ?? '验证码发送失败，请稍后重试';
        setServerError(message);
        if (message.includes('Phone Provider 已关闭') || message.includes('Test OTP')) {
          setShowManualCodeEntry(true);
        }
        onError?.(message);
      });
    },
    [codeForm, onError],
  );

  const handleResendCode = useCallback(() => {
    if (countdown > 0) return;
    setServerError(null);
    setShowManualCodeEntry(false);
    startTransition(async () => {
      const result = await sendVerificationCode({ phone });
      if (result.success) {
        setCountdown(COUNTDOWN_SECONDS);
        return;
      }

      setServerError(result.error ?? '验证码发送失败，请稍后重试');
    });
  }, [phone, countdown]);

  const handleVerifyCode = useCallback(
    (data: VerifyCodeFormValues) => {
      setServerError(null);
      startTransition(async () => {
        const result = await verifyAndLogin({ phone: data.phone, code: data.code });
        if (result.success && result.data) {
          onSuccess(result.data.userId, result.data.isNewUser);
          return;
        }

        const message = result.error ?? '验证码校验失败，请重试';
        setServerError(message);
        onError?.(message);
      });
    },
    [onSuccess, onError],
  );

  const moveToCodeStepManually = useCallback(() => {
    const currentPhone = phoneForm.getValues('phone');
    if (!currentPhone) {
      setServerError('请先输入手机号，再继续。');
      return;
    }
    setPhone(currentPhone);
    codeForm.setValue('phone', currentPhone);
    setStep('code');
    setServerError(null);
  }, [codeForm, phoneForm]);

  const isDev = process.env.NODE_ENV !== 'production';

  return (
    <div className="w-full max-w-md">
      <div className="mb-6 text-center">
        <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          健康饮食 7 天打卡挑战
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">欢迎来到 吃了么</h1>
        <p className="mt-2 text-sm text-muted-foreground">记录三餐、挑战返现、轻社交分享，一次完成。</p>
      </div>

      <div className="rounded-3xl border border-border/60 bg-card/95 p-5 shadow-xl backdrop-blur-sm">
        <AnimatePresence mode="wait">
          {step === 'phone' ? (
            <motion.div
              key="phone-step"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <form onSubmit={phoneForm.handleSubmit(handleSendCode)} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="phone">手机号</Label>
                  <div className="relative">
                    <Phone
                      className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="phone"
                      type="tel"
                      inputMode="numeric"
                      placeholder="请输入 11 位手机号"
                      className="h-11 rounded-xl pl-10"
                      maxLength={11}
                      aria-describedby="phone-error"
                      {...phoneForm.register('phone')}
                    />
                  </div>
                  {phoneForm.formState.errors.phone && (
                    <p id="phone-error" className="text-sm text-destructive" role="alert">
                      {phoneForm.formState.errors.phone.message}
                    </p>
                  )}
                </div>

                {serverError && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>{serverError}</p>
                    </div>
                  </div>
                )}

                {showManualCodeEntry && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full rounded-xl"
                    onClick={moveToCodeStepManually}
                  >
                    我已配置 Test OTP，继续输入验证码
                  </Button>
                )}

                <Button type="submit" className="h-11 w-full rounded-xl" size="lg" disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  获取验证码
                </Button>

                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-card px-2 text-muted-foreground">或</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full rounded-xl"
                  size="lg"
                  disabled={isPending}
                  onClick={handleWeChatLogin}
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  )}
                  微信登录
                </Button>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="code-step"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <form onSubmit={codeForm.handleSubmit(handleVerifyCode)} className="space-y-4" noValidate>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    验证码已发送到 <span className="font-semibold text-foreground">{phone}</span>
                  </p>
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline"
                    onClick={() => {
                      setStep('phone');
                      setServerError(null);
                      codeForm.reset();
                    }}
                  >
                    修改手机号
                  </button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="code">验证码</Label>
                  <div className="relative">
                    <ShieldCheck
                      className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="code"
                      type="text"
                      inputMode="numeric"
                      placeholder="请输入 6 位验证码"
                      className="h-11 rounded-xl pl-10"
                      maxLength={6}
                      autoComplete="one-time-code"
                      aria-describedby="code-error"
                      {...codeForm.register('code')}
                    />
                  </div>
                  {codeForm.formState.errors.code && (
                    <p id="code-error" className="text-sm text-destructive" role="alert">
                      {codeForm.formState.errors.code.message}
                    </p>
                  )}
                </div>

                {serverError && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>{serverError}</p>
                    </div>
                  </div>
                )}

                <Button type="submit" className="h-11 w-full rounded-xl" size="lg" disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  登录
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                    disabled={countdown > 0 || isPending}
                    onClick={handleResendCode}
                  >
                    {countdown > 0 ? `重新发送（${countdown}s）` : '重新发送验证码'}
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {isDev && (
          <div className="mt-5 rounded-2xl border border-primary/25 bg-primary/5 p-4">
            <p className="text-sm font-semibold text-foreground">本地测试示例账号</p>
            <p className="mt-1 text-xs text-muted-foreground">
              先在 Supabase 控制台的 Authentication {'>'} Phone {'>'} Test OTP 中添加同样的手机号和验证码。
            </p>
            <div className="mt-3 space-y-1.5 text-xs text-foreground">
              {LOCAL_TEST_ACCOUNTS.map((account) => (
                <div key={account.phone} className="flex items-center justify-between rounded-lg bg-background/80 px-2.5 py-1.5">
                  <span className="font-medium">{account.tag}</span>
                  <span className="font-mono">{account.phone} / {account.code}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useCallback, useEffect, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, ShieldCheck, Loader2 } from 'lucide-react';
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

export function LoginForm({ onSuccess, onError }: LoginFormProps) {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Phone form
  const phoneForm = useForm<SendCodeFormValues>({
    resolver: zodResolver(sendCodeSchema),
    defaultValues: { phone: '' },
  });

  // Code form
  const codeForm = useForm<VerifyCodeFormValues>({
    resolver: zodResolver(verifyCodeSchema),
    defaultValues: { phone: '', code: '' },
  });

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Initiate WeChat OAuth login
  const handleWeChatLogin = useCallback(() => {
    setServerError(null);
    startTransition(async () => {
      const result = await initiateWeChatLogin();
      if (result.success && result.data) {
        // Store state in cookie for CSRF validation on callback
        document.cookie = `wechat_oauth_state=${result.data.state};path=/;max-age=600;samesite=lax`;
        // Redirect to WeChat authorization page
        window.location.href = result.data.authUrl;
      } else {
        setServerError(result.error ?? '微信登录失败');
        onError?.(result.error ?? '微信登录失败');
      }
    });
  }, [onError]);

  // Send verification code
  const handleSendCode = useCallback(
    (data: SendCodeFormValues) => {
      setServerError(null);
      startTransition(async () => {
        const result = await sendVerificationCode({ phone: data.phone });
        if (result.success) {
          setPhone(data.phone);
          codeForm.setValue('phone', data.phone);
          setStep('code');
          setCountdown(COUNTDOWN_SECONDS);
        } else {
          setServerError(result.error ?? '发送失败');
          onError?.(result.error ?? '发送失败');
        }
      });
    },
    [codeForm, onError]
  );

  // Resend code
  const handleResendCode = useCallback(() => {
    if (countdown > 0) return;
    setServerError(null);
    startTransition(async () => {
      const result = await sendVerificationCode({ phone });
      if (result.success) {
        setCountdown(COUNTDOWN_SECONDS);
      } else {
        setServerError(result.error ?? '发送失败');
      }
    });
  }, [phone, countdown]);

  // Verify code
  const handleVerifyCode = useCallback(
    (data: VerifyCodeFormValues) => {
      setServerError(null);
      startTransition(async () => {
        const result = await verifyAndLogin({ phone: data.phone, code: data.code });
        if (result.success && result.data) {
          onSuccess(result.data.userId, result.data.isNewUser);
        } else {
          setServerError(result.error ?? '验证失败');
          onError?.(result.error ?? '验证失败');
        }
      });
    },
    [onSuccess, onError]
  );

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-foreground">吃了么</h1>
        <p className="text-sm text-muted-foreground mt-1">极简三餐饮食记录</p>
      </div>

      <AnimatePresence mode="wait">
        {step === 'phone' ? (
          <motion.div
            key="phone-step"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <form
              onSubmit={phoneForm.handleSubmit(handleSendCode)}
              className="space-y-4"
              noValidate
            >
              <div className="space-y-2">
                <Label htmlFor="phone">手机号</Label>
                <div className="relative">
                  <Phone
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="请输入手机号"
                    className="pl-10"
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
                <p className="text-sm text-destructive" role="alert">
                  {serverError}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                获取验证码
              </Button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    或
                  </span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                size="lg"
                disabled={isPending}
                onClick={handleWeChatLogin}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <svg
                    className="h-5 w-5 mr-2"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05a6.127 6.127 0 0 1-.253-1.726c0-3.573 3.26-6.47 7.278-6.47.122 0 .243.005.364.014-.494-2.95-3.733-5.45-7.7-5.45zm5.09 11.677c-.728 0-1.32-.616-1.32-1.378 0-.762.592-1.378 1.32-1.378.728 0 1.32.616 1.32 1.378 0 .762-.592 1.378-1.32 1.378zm4.985 0c-.728 0-1.32-.616-1.32-1.378 0-.762.592-1.378 1.32-1.378.728 0 1.32.616 1.32 1.378 0 .762-.592 1.378-1.32 1.378zM8.691 7.434c-.837 0-1.515-.708-1.515-1.582 0-.874.678-1.582 1.515-1.582.837 0 1.515.708 1.515 1.582 0 .874-.678 1.582-1.515 1.582zm-5.73 0c-.837 0-1.515-.708-1.515-1.582 0-.874.678-1.582 1.515-1.582.837 0 1.515.708 1.515 1.582 0 .874-.678 1.582-1.515 1.582z" />
                  </svg>
                )}
                微信登录
              </Button>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="code-step"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
          >
            <form
              onSubmit={codeForm.handleSubmit(handleVerifyCode)}
              className="space-y-4"
              noValidate
            >
              <div className="space-y-1 mb-4">
                <p className="text-sm text-muted-foreground">
                  验证码已发送至 <span className="font-medium text-foreground">{phone}</span>
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
                  更换手机号
                </button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">验证码</Label>
                <div className="relative">
                  <ShieldCheck
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    placeholder="请输入6位验证码"
                    className="pl-10"
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
                <p className="text-sm text-destructive" role="alert">
                  {serverError}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                登录
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                  disabled={countdown > 0 || isPending}
                  onClick={handleResendCode}
                >
                  {countdown > 0
                    ? `重新发送 (${countdown}s)`
                    : '重新发送验证码'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

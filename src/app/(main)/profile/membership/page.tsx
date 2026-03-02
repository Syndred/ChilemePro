'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Crown, Sparkles, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MainPageSkeleton } from '@/components/skeleton/PageSkeletons';
import { getMembershipStatus } from '@/app/actions/membership';
import { getPaymentStatus } from '@/app/actions/payment';
import {
  FREE_FEATURES,
  PREMIUM_FEATURES,
  MEMBERSHIP_PLANS,
  getYearlySavingsPercent,
} from '@/lib/utils/membership';
import type { MembershipStatus } from '@/lib/utils/membership';

type SelectedPlan = 'monthly' | 'yearly';
type PaymentProvider = 'wechat' | 'alipay';

export default function MembershipPage() {
  const router = useRouter();
  const [status, setStatus] = useState<MembershipStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<SelectedPlan>('yearly');
  const [provider, setProvider] = useState<PaymentProvider>('wechat');
  const [paying, setPaying] = useState(false);
  const [pendingTxId, setPendingTxId] = useState<string | null>(null);
  const [paymentHint, setPaymentHint] = useState<string | null>(null);
  const providerLabel = provider === 'wechat' ? '微信支付' : '支付宝';

  const loadStatus = useCallback(async () => {
    const result = await getMembershipStatus();
    if (result.success && result.data) {
      setStatus(result.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!pendingTxId) {
      return;
    }

    const timer = setInterval(async () => {
      const result = await getPaymentStatus(pendingTxId);
      if (!result.success || !result.data) {
        return;
      }

      if (result.data.status === 'completed') {
        setPendingTxId(null);
        setPaymentHint('支付成功，会员权益已生效');
        await loadStatus();
      } else if (result.data.status === 'failed') {
        setPendingTxId(null);
        setPaymentHint('支付失败，请重试');
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [pendingTxId, loadStatus]);

  const handleSubscribe = useCallback(async () => {
    setPaying(true);
    setPaymentHint(null);

    try {
      const plan = MEMBERSHIP_PLANS[selectedPlan];
      const response = await fetch(`/api/payment/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'membership',
          amount: plan.price,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        status?: 'pending' | 'completed';
        paymentIntentId?: string;
        mock?: boolean;
      };

      if (!response.ok) {
        setPaymentHint(data.error ?? `${providerLabel}下单失败，请重试`);
        return;
      }

      if (data.status === 'completed') {
        setPaymentHint(data.mock ? `测试${providerLabel}成功，会员已生效` : `${providerLabel}成功`);
        await loadStatus();
        return;
      }

      if (data.paymentIntentId) {
        setPendingTxId(data.paymentIntentId);
        setPaymentHint(`订单已创建，请完成${providerLabel}后等待状态更新`);
        return;
      }

      setPaymentHint(`支付订单创建成功，请完成${providerLabel}`);
    } catch {
      setPaymentHint('网络错误，请重试');
    } finally {
      setPaying(false);
    }
  }, [selectedPlan, provider, providerLabel, loadStatus]);

  const savingsPercent = getYearlySavingsPercent();

  if (loading) {
    return <MainPageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="返回">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">会员中心</h1>
      </div>

      {status && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              {status.isPremium ? (
                <Crown className="h-8 w-8 text-yellow-500" />
              ) : (
                <Sparkles className="h-8 w-8 text-muted-foreground" />
              )}
              <div>
                <p className="font-semibold">{status.isPremium ? '会员版' : '免费版'}</p>
                {status.isPremium && status.expiresAt && (
                  <p className="text-xs text-muted-foreground">
                    到期时间: {status.expiresAt.toLocaleDateString('zh-CN')}
                  </p>
                )}
                {status.isExpired && (
                  <p className="text-xs text-destructive">会员已过期</p>
                )}
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6"
      >
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">权益对比</h2>
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <p className="mb-3 text-center font-semibold">免费版</p>
            <ul className="space-y-2">
              {FREE_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-xs">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="border-primary p-4">
            <p className="mb-3 text-center font-semibold text-primary">
              <Crown className="mr-1 inline h-4 w-4" />
              会员版
            </p>
            <ul className="space-y-2">
              {PREMIUM_FEATURES.filter(
                (feature) => !FREE_FEATURES.includes(feature as typeof FREE_FEATURES[number]),
              ).map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-xs">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  <span className="font-medium">{feature}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </motion.div>

      {!status?.isPremium && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6 space-y-3"
        >
          <h2 className="text-sm font-semibold text-muted-foreground">选择订阅方案</h2>

          <Card
            className={`cursor-pointer p-4 transition-colors ${
              selectedPlan === 'yearly' ? 'border-primary ring-2 ring-primary/20' : ''
            }`}
            onClick={() => setSelectedPlan('yearly')}
            role="radio"
            aria-checked={selectedPlan === 'yearly'}
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && setSelectedPlan('yearly')}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{MEMBERSHIP_PLANS.yearly.name}</p>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    省 {savingsPercent}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  ¥{MEMBERSHIP_PLANS.yearly.pricePerMonth}/月
                </p>
              </div>
              <p className="text-lg font-bold">
                ¥{MEMBERSHIP_PLANS.yearly.price}
                <span className="text-xs font-normal text-muted-foreground">
                  /{MEMBERSHIP_PLANS.yearly.period}
                </span>
              </p>
            </div>
          </Card>

          <Card
            className={`cursor-pointer p-4 transition-colors ${
              selectedPlan === 'monthly' ? 'border-primary ring-2 ring-primary/20' : ''
            }`}
            onClick={() => setSelectedPlan('monthly')}
            role="radio"
            aria-checked={selectedPlan === 'monthly'}
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && setSelectedPlan('monthly')}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{MEMBERSHIP_PLANS.monthly.name}</p>
                <p className="text-xs text-muted-foreground">按月付费</p>
              </div>
              <p className="text-lg font-bold">
                ¥{MEMBERSHIP_PLANS.monthly.price}
                <span className="text-xs font-normal text-muted-foreground">
                  /{MEMBERSHIP_PLANS.monthly.period}
                </span>
              </p>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={provider === 'wechat' ? 'default' : 'outline'}
              onClick={() => setProvider('wechat')}
              disabled={paying || !!pendingTxId}
            >
              微信支付
            </Button>
            <Button
              type="button"
              variant={provider === 'alipay' ? 'default' : 'outline'}
              onClick={() => setProvider('alipay')}
              disabled={paying || !!pendingTxId}
            >
              支付宝
            </Button>
          </div>

          <Button className="w-full" size="lg" onClick={handleSubscribe} disabled={paying || !!pendingTxId}>
            {paying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                处理中...
              </>
            ) : pendingTxId ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                等待支付结果...
              </>
            ) : (
              `使用${providerLabel}订阅 ¥${MEMBERSHIP_PLANS[selectedPlan].price}/${MEMBERSHIP_PLANS[selectedPlan].period}`
            )}
          </Button>

          {paymentHint && (
            <p className="text-center text-xs text-muted-foreground">{paymentHint}</p>
          )}
        </motion.div>
      )}

      {status?.isPremium && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center"
        >
          <p className="text-sm text-muted-foreground">您已是会员，权益已开启。</p>
          {paymentHint && (
            <p className="mt-2 text-xs text-muted-foreground">{paymentHint}</p>
          )}
        </motion.div>
      )}
    </div>
  );
}

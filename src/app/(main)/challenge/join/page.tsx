'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Shield, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  CHALLENGE_DEPOSIT,
  DAILY_REWARDS,
  TOTAL_POSSIBLE_REWARD,
} from '@/lib/utils/challenge';

interface JoinPaymentResult {
  success: boolean;
  error?: string;
  paymentIntentId?: string;
  status?: 'pending' | 'completed';
}

/**
 * Join challenge page.
 * Security fix: this page now creates a payment transaction first.
 * Challenge activation happens only after payment completion.
 */
export default function JoinChallengePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [agreed, setAgreed] = useState(false);

  const joinMutation = useMutation({
    mutationFn: async (): Promise<JoinPaymentResult> => {
      const response = await fetch('/api/payment/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'deposit',
          amount: CHALLENGE_DEPOSIT,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        paymentIntentId?: string;
        status?: 'pending' | 'completed';
      };

      if (!response.ok) {
        return {
          success: false,
          error: data.error ?? '支付创建失败，请重试',
        };
      }

      return {
        success: true,
        paymentIntentId: data.paymentIntentId,
        status: data.status ?? 'pending',
      };
    },
    onSuccess: (result) => {
      if (!result.success) {
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['activeChallenge'] });

      if (result.status === 'completed') {
        router.push('/challenge');
        return;
      }

      if (result.paymentIntentId) {
        router.push(`/challenge?payment=pending&tx=${result.paymentIntentId}`);
        return;
      }

      router.push('/challenge');
    },
  });

  const error = joinMutation.data?.success === false ? joinMutation.data.error : undefined;

  return (
    <div className="px-4 py-6">
      <button
        onClick={() => router.back()}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground"
        aria-label="返回"
      >
        <ArrowLeft className="h-4 w-4" />
        返回
      </button>

      <h1 className="mb-6 text-2xl font-bold">参与挑战</h1>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-4"
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-500" />
              押金说明
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">押金金额</span>
              <span className="text-xl font-bold">¥{CHALLENGE_DEPOSIT}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">最高可返</span>
              <span className="font-medium text-green-600">¥{TOTAL_POSSIBLE_REWARD}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">挑战周期</span>
              <span className="font-medium">7 天</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>挑战规则</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                每日完成三餐记录，热量摄入在目标 ±10% 范围内
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                每日任务截止时间为 23:30
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                未完成任务金额进入奖金池
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                仅在支付成功后，挑战才会正式生效
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>每日返现明细</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {Object.entries(DAILY_REWARDS).map(([day, reward]) => (
                <div key={day} className="rounded-md bg-muted p-2">
                  <div className="text-muted-foreground">第{day}天</div>
                  <div className="font-bold text-primary">¥{reward}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            我已阅读并同意挑战规则
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            className="w-full"
            size="lg"
            disabled={!agreed || joinMutation.isPending}
            onClick={() => joinMutation.mutate()}
          >
            {joinMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            支付 ¥{CHALLENGE_DEPOSIT} 并参与挑战
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Shield, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { joinChallenge } from '@/app/actions/challenge';
import { CHALLENGE_DEPOSIT, DAILY_REWARDS, TOTAL_POSSIBLE_REWARD } from '@/lib/utils/challenge';

/**
 * Join challenge page — confirm deposit and start challenge.
 * Requirement 9.1: User pays 100 元 deposit
 * Requirement 9.2: 7-day challenge from payment day
 */
export default function JoinChallengePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [agreed, setAgreed] = useState(false);

  const joinMutation = useMutation({
    mutationFn: () => joinChallenge({ deposit: CHALLENGE_DEPOSIT }),
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['activeChallenge'] });
        router.push('/challenge');
      }
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
        {/* Deposit info */}
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

        {/* Rules */}
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
                完成每日任务即可获得对应返现
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                挑战未开始前可取消并全额退款
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                挑战开始后不可退出，押金不予退还
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Reward breakdown */}
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

        {/* Agreement + Submit */}
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
            支付 ¥{CHALLENGE_DEPOSIT} 参与挑战
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

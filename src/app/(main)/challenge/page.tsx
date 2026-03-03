'use client';

import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Trophy,
  Calendar,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  RefreshCw,
  CreditCard,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MainPageSkeleton } from '@/components/skeleton/PageSkeletons';
import { getActiveChallenge, cancelChallenge } from '@/app/actions/challenge';
import { getPaymentStatus } from '@/app/actions/payment';
import { DAILY_REWARDS, CHALLENGE_DEPOSIT } from '@/lib/utils/challenge';
import { toast } from '@/lib/ui/toast';
import type { Challenge } from '@/types';

/**
 * Challenge home page.
 */
export default function ChallengePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const paymentState = searchParams.get('payment');
  const tx = searchParams.get('tx');
  const shouldPollPayment = paymentState === 'pending' && !!tx;
  const lastPaymentStatusRef = useRef<string | null>(null);

  const { data: result, isLoading } = useQuery({
    queryKey: ['activeChallenge'],
    queryFn: () => getActiveChallenge(),
  });

  const paymentStatusQuery = useQuery({
    queryKey: ['paymentStatus', tx],
    queryFn: () => getPaymentStatus(tx!),
    enabled: shouldPollPayment,
    refetchInterval: shouldPollPayment ? 3000 : false,
  });

  useEffect(() => {
    const status = paymentStatusQuery.data?.data?.status;
    if (!status || status === lastPaymentStatusRef.current) {
      return;
    }

    lastPaymentStatusRef.current = status;

    if (status === 'completed') {
      toast.success('\u652F\u4ED8\u6210\u529F\uFF0C\u6311\u6218\u5DF2\u6FC0\u6D3B');
      queryClient.invalidateQueries({ queryKey: ['activeChallenge'] });
      return;
    }

    if (status === 'failed') {
      toast.error('\u652F\u4ED8\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5');
    }
  }, [paymentStatusQuery.data, queryClient]);

  const cancelMutation = useMutation({
    mutationFn: (challengeId: string) => cancelChallenge(challengeId),
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['activeChallenge'] });
        toast.success('\u5DF2\u53D6\u6D88\u6311\u6218');
      } else {
        toast.error(res.error ?? '\u53D6\u6D88\u6311\u6218\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5');
      }
    },
    onError: () => {
      toast.error('\u53D6\u6D88\u6311\u6218\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5');
    },
  });

  if (isLoading) {
    return <MainPageSkeleton />;
  }

  const challenge = result?.success ? result.data : null;

  if (!challenge) {
    if (shouldPollPayment) {
      return (
        <PendingPaymentView
          tx={tx!}
          paymentStatus={paymentStatusQuery.data?.data?.status}
          isChecking={paymentStatusQuery.isFetching}
          onRefresh={() => paymentStatusQuery.refetch()}
          onBack={() => router.push('/challenge/join')}
        />
      );
    }
    return <NoChallengeView onJoin={() => router.push('/challenge/join')} />;
  }

  return (
    <ActiveChallengeView
      challenge={challenge}
      onCancel={() => cancelMutation.mutate(challenge.id)}
      isCancelling={cancelMutation.isPending}
      cancelError={cancelMutation.data?.success === false ? cancelMutation.data.error : undefined}
    />
  );
}

function PendingPaymentView({
  tx,
  paymentStatus,
  isChecking,
  onRefresh,
  onBack,
}: {
  tx: string;
  paymentStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  isChecking: boolean;
  onRefresh: () => void;
  onBack: () => void;
}) {
  const statusText =
    paymentStatus === 'completed'
      ? '支付成功，正在激活挑战...'
      : paymentStatus === 'failed'
        ? '支付失败，请重新发起支付'
        : paymentStatus === 'processing'
          ? '支付处理中，请稍候'
          : '等待支付完成';

  return (
    <div className="px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold">挑战支付中</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            押金支付状态
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">交易号: {tx}</p>
          <p>{statusText}</p>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onRefresh} disabled={isChecking}>
              {isChecking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              刷新状态
            </Button>
            <Button variant="ghost" onClick={onBack}>
              返回重试
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NoChallengeView({ onJoin }: { onJoin: () => void }) {
  return (
    <div className="px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold">健康周计划挑战</h1>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              7 天健康饮食挑战
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              支付 {CHALLENGE_DEPOSIT} 元押金，坚持 7 天健康饮食，完成任务可获得返现奖励。
            </p>

            <div className="space-y-2">
              <h3 className="font-medium">每日任务</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  完成三餐记录
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  热量摄入达标（目标 ±10%）
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-medium">返现规则</h3>
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {Object.entries(DAILY_REWARDS).map(([day, reward]) => (
                  <div key={day} className="rounded-md bg-muted p-2">
                    <div className="text-muted-foreground">D{day}</div>
                    <div className="font-medium text-primary">{reward}元</div>
                  </div>
                ))}
              </div>
            </div>

            <Button className="w-full" size="lg" onClick={onJoin}>
              立即参与
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function ActiveChallengeView({
  challenge,
  onCancel,
  isCancelling,
  cancelError,
}: {
  challenge: Challenge;
  onCancel: () => void;
  isCancelling: boolean;
  cancelError?: string;
}) {
  const completedDays = challenge.dailyTasks.filter((task) => task.completed).length;
  const isPending = challenge.status === 'pending';

  return (
    <div className="px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold">我的挑战</h1>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                7 天健康挑战
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  isPending
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-green-100 text-green-700'
                }`}
              >
                {isPending ? '待开始' : '进行中'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {new Date(challenge.startDate).toLocaleDateString('zh-CN')} -{' '}
              {new Date(challenge.endDate).toLocaleDateString('zh-CN')}
            </div>

            <div className="text-sm">
              已完成 <span className="font-bold text-primary">{completedDays}</span> / 7 天
            </div>

            <div className="grid grid-cols-7 gap-1">
              {challenge.dailyTasks.map((task) => (
                <div
                  key={task.day}
                  className={`flex flex-col items-center rounded-md p-2 text-xs ${
                    task.completed
                      ? 'bg-green-100 text-green-700'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <span>D{task.day}</span>
                  {task.completed ? (
                    <CheckCircle2 className="mt-1 h-4 w-4" />
                  ) : (
                    <XCircle className="mt-1 h-4 w-4" />
                  )}
                  <span className="mt-1">{task.reward}元</span>
                </div>
              ))}
            </div>

            {isPending && (
              <div className="space-y-2">
                {cancelError && <p className="text-sm text-destructive">{cancelError}</p>}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={onCancel}
                  disabled={isCancelling}
                >
                  {isCancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  取消挑战（全额退款）
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

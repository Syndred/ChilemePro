'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Trophy, Calendar, CheckCircle2, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getActiveChallenge, cancelChallenge } from '@/app/actions/challenge';
import { DAILY_REWARDS, CHALLENGE_DEPOSIT } from '@/lib/utils/challenge';
import type { Challenge } from '@/types';

/**
 * Challenge home page — shows active challenge or invite to join.
 * Requirement 9.1-9.8: Challenge participation flow
 */
export default function ChallengePage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: result, isLoading } = useQuery({
    queryKey: ['activeChallenge'],
    queryFn: () => getActiveChallenge(),
  });

  const cancelMutation = useMutation({
    mutationFn: (challengeId: string) => cancelChallenge(challengeId),
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['activeChallenge'] });
      }
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const challenge = result?.success ? result.data : null;

  if (!challenge) {
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
              支付 {CHALLENGE_DEPOSIT} 元押金，坚持 7 天健康饮食，完成任务即可获得返现奖励！
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
  const completedDays = challenge.dailyTasks.filter((t) => t.completed).length;
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

            {/* Daily task grid */}
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
                {cancelError && (
                  <p className="text-sm text-destructive">{cancelError}</p>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={onCancel}
                  disabled={isCancelling}
                >
                  {isCancelling ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
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

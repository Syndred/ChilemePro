'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Trophy, Medal, ArrowLeft, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MainPageSkeleton } from '@/components/skeleton/PageSkeletons';
import { getLeaderboard } from '@/app/actions/challenge';

/**
 * Challenge leaderboard page.
 * Requirement 12.1: Show all participants' progress for the current period.
 * Requirement 12.2: Sort by completed days and completion time.
 * Requirement 12.3: Display rank, nickname, completed days.
 * Requirement 12.4: Protect privacy — only nickname and avatar.
 * Requirement 12.5: Real-time leaderboard data.
 */
export default function LeaderboardPage() {
  const router = useRouter();

  const { data: result, isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => getLeaderboard(),
    refetchInterval: 30_000, // Refresh every 30s for near real-time updates
  });

  if (isLoading) {
    return <MainPageSkeleton />;
  }

  const entries = result?.success ? result.data?.entries ?? [] : [];
  const totalParticipants = result?.success ? result.data?.totalParticipants ?? 0 : 0;
  const error = result?.success === false ? result.error : undefined;

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

      <h1 className="mb-6 text-2xl font-bold flex items-center gap-2">
        <Trophy className="h-6 w-6 text-yellow-500" />
        挑战排行榜
      </h1>

      {error && (
        <Card className="mb-4">
          <CardContent className="py-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              本期参与者
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              共 {totalParticipants} 人
            </span>
          </CardTitle>
        </CardHeader>
      </Card>

      {entries.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <motion.div
              key={entry.userId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.03 }}
            >
              <LeaderboardRow entry={entry} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}


function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return <Medal className="h-5 w-5 text-yellow-500" />;
  }
  if (rank === 2) {
    return <Medal className="h-5 w-5 text-gray-400" />;
  }
  if (rank === 3) {
    return <Medal className="h-5 w-5 text-amber-600" />;
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center text-xs font-medium text-muted-foreground">
      {rank}
    </span>
  );
}

function LeaderboardRow({
  entry,
}: {
  entry: {
    rank: number;
    nickname: string;
    avatar: string;
    completedDays: number;
  };
}) {
  const isTopThree = entry.rank <= 3;

  return (
    <Card
      className={isTopThree ? 'border-yellow-200 bg-yellow-50/50' : ''}
    >
      <CardContent className="flex items-center gap-3 py-3 px-4">
        {/* Rank */}
        <div className="flex w-8 shrink-0 items-center justify-center">
          <RankBadge rank={entry.rank} />
        </div>

        {/* Avatar */}
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
          {entry.avatar ? (
            <Image
              src={entry.avatar}
              alt=""
              width={36}
              height={36}
              unoptimized
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              {entry.nickname.charAt(0)}
            </div>
          )}
        </div>

        {/* Name */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{entry.nickname}</p>
        </div>

        {/* Completed days */}
        <div className="shrink-0 text-right">
          <span className="text-sm font-bold text-primary">
            {entry.completedDays}
          </span>
          <span className="text-xs text-muted-foreground">/7 天</span>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Trophy className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">暂无排行榜数据</p>
        <p className="mt-1 text-xs text-muted-foreground">
          当有用户参与挑战后，排行榜将自动更新
        </p>
      </CardContent>
    </Card>
  );
}

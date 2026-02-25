'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  User,
  Edit3,
  Wallet,
  Crown,
  Trophy,
  Share2,
  Settings,
  ChevronRight,
  Flame,
  Calendar,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getProfileSummary } from '@/app/actions/profile';
import {
  generateInviteInfo,
  getMembershipLabel,
} from '@/lib/utils/profile';
import { formatWithdrawalAmount } from '@/lib/utils/withdrawal';

/**
 * Profile page — personal center.
 * Requirement 16.1: Edit personal info
 * Requirement 16.2: Check-in statistics
 * Requirement 16.3: Reward balance and withdrawal history
 * Requirement 16.4: Membership center entry
 * Requirement 16.5: Invite friends
 */
export default function ProfilePage() {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const { data: result, isLoading } = useQuery({
    queryKey: ['profileSummary'],
    queryFn: () => getProfileSummary(),
  });

  const profile = result?.success ? result.data : null;

  const handleCopyInvite = useCallback(async () => {
    if (!profile) return;
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const inviteInfo = generateInviteInfo('user', baseUrl);
    try {
      await navigator.clipboard.writeText(inviteInfo.inviteMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: do nothing
    }
  }, [profile]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* Profile Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="mb-4 overflow-hidden">
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-6">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
                {profile?.avatar ? (
                  <img
                    src={profile.avatar}
                    alt={profile.nickname}
                    className="h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <User className="h-8 w-8 text-primary" />
                )}
              </div>

              {/* Name & Membership */}
              <div className="flex-1">
                <h1 className="text-xl font-bold">
                  {profile?.nickname || '用户'}
                </h1>
                <div className="mt-1 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-xs">
                    {profile?.membershipTier !== 'free' ? (
                      <Crown className="h-3 w-3 text-yellow-500" />
                    ) : null}
                    {getMembershipLabel(profile?.membershipTier || 'free')}
                  </span>
                </div>
              </div>

              {/* Edit Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push('/profile/edit')}
                aria-label="编辑资料"
              >
                <Edit3 className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Check-in Stats - Requirement 16.2 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <Card className="mb-4">
          <CardContent className="py-4">
            <div className="grid grid-cols-3 divide-x text-center">
              <div className="px-2">
                <div className="flex items-center justify-center gap-1 text-2xl font-bold text-primary">
                  <Calendar className="h-5 w-5" />
                  {profile?.checkInStats.totalCheckInDays ?? 0}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">打卡天数</p>
              </div>
              <div className="px-2">
                <div className="flex items-center justify-center gap-1 text-2xl font-bold text-orange-500">
                  <Flame className="h-5 w-5" />
                  {profile?.checkInStats.currentStreak ?? 0}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">连续打卡</p>
              </div>
              <div className="px-2">
                <div className="flex items-center justify-center gap-1 text-2xl font-bold text-green-500">
                  <Trophy className="h-5 w-5" />
                  {profile?.checkInStats.longestStreak ?? 0}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">最长连续</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Reward Balance - Requirement 16.3 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Card
          className="mb-4 cursor-pointer transition-colors hover:bg-accent/50"
          onClick={() => router.push('/profile/rewards')}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && router.push('/profile/rewards')}
        >
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100">
                <Wallet className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm font-medium">奖励余额</p>
                <p className="text-lg font-bold text-orange-600">
                  {formatWithdrawalAmount(profile?.rewardBalance ?? 0)}
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </motion.div>

      {/* Menu Items */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
      >
        <Card className="mb-4">
          <CardContent className="divide-y p-0">
            {/* Membership - Requirement 16.4 */}
            <MenuItem
              icon={<Crown className="h-5 w-5 text-yellow-500" />}
              label="会员中心"
              onClick={() => router.push('/profile/membership')}
            />

            {/* Invite Friends - Requirement 16.5 */}
            <MenuItem
              icon={<Share2 className="h-5 w-5 text-blue-500" />}
              label="邀请好友"
              trailing={
                copied ? (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <Check className="h-3 w-3" /> 已复制
                  </span>
                ) : (
                  <Copy className="h-4 w-4 text-muted-foreground" />
                )
              }
              onClick={handleCopyInvite}
            />

            {/* Settings - Requirement 16.6 */}
            <MenuItem
              icon={<Settings className="h-5 w-5 text-gray-500" />}
              label="设置"
              onClick={() => router.push('/profile/settings')}
            />
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  trailing,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  trailing?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-accent/50"
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      {trailing || <ChevronRight className="h-5 w-5 text-muted-foreground" />}
    </button>
  );
}


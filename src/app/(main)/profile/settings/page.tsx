'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Bell,
  Shield,
  User,
  LogOut,
  Loader2,
  Smartphone,
  MessageCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MainPageSkeleton } from '@/components/skeleton/PageSkeletons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getUserSettings,
  logoutUser,
  updateNotificationSettings,
  updatePrivacySettings,
} from '@/app/actions/settings';
import { savePushSubscription, removePushSubscription } from '@/app/actions/push';
import {
  getDefaultSettings,
  type NotificationSettings,
  type PrivacySettings,
  type AccountSettings,
} from '@/lib/utils/settings';
import {
  isPushSupported,
  getPushState,
  subscribeToPush,
  unsubscribeFromPush,
  serializePushSubscription,
} from '@/lib/push/push-subscription';
import { toast } from '@/lib/ui/toast';

function shouldEnablePush(settings: NotificationSettings): boolean {
  return Object.values(settings).some(Boolean);
}

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [savingHint, setSavingHint] = useState<string | null>(null);

  const defaults = getDefaultSettings();
  const [notifications, setNotifications] = useState<NotificationSettings>(
    defaults.notifications,
  );
  const [privacy, setPrivacy] = useState<PrivacySettings>(defaults.privacy);
  const [account, setAccount] = useState<AccountSettings>(defaults.account);

  useEffect(() => {
    async function load() {
      const result = await getUserSettings();
      if (result.success && result.data) {
        setNotifications(result.data.notifications);
        setPrivacy(result.data.privacy);
        setAccount(result.data.account);
      }
      setLoading(false);
    }
    load();
  }, []);

  const syncPushState = useCallback(async (next: NotificationSettings) => {
    if (!isPushSupported()) {
      return;
    }

    const needsPush = shouldEnablePush(next);
    const state = await getPushState();

    if (needsPush && !state.subscribed) {
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        setSavingHint('已保存设置，但未配置 VAPID 公钥，无法启用推送');
        return;
      }

      const subscription = await subscribeToPush(vapidPublicKey);
      if (!subscription) {
        setSavingHint('通知权限未授予，推送订阅失败');
        return;
      }

      const payload = serializePushSubscription(subscription);
      await savePushSubscription(payload);
      return;
    }

    if (!needsPush && state.subscribed) {
      let endpoint = '';
      try {
        const registration = await navigator.serviceWorker.ready;
        const active = await registration.pushManager.getSubscription();
        endpoint = active?.endpoint ?? '';
      } catch {
        endpoint = '';
      }

      await unsubscribeFromPush();
      if (endpoint) {
        await removePushSubscription(endpoint);
      }
    }
  }, []);

  const updateNotification = useCallback(
    async (key: keyof NotificationSettings, value: boolean) => {
      const next = { ...notifications, [key]: value };
      setNotifications(next);
      setSavingHint('正在保存...');

      const result = await updateNotificationSettings(next);
      if (!result.success) {
        setNotifications(notifications);
        toast.error(result.error ?? '\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5');
        setSavingHint(result.error ?? '保存失败');
        return;
      }

      await syncPushState(next);
      toast.success('\u8BBE\u7F6E\u5DF2\u4FDD\u5B58');
      setSavingHint('已保存');
      setTimeout(() => setSavingHint(null), 1500);
    },
    [notifications, syncPushState],
  );

  const updatePrivacy = useCallback(
    async (key: keyof PrivacySettings, value: boolean) => {
      const next = { ...privacy, [key]: value };
      setPrivacy(next);
      setSavingHint('正在保存...');

      const result = await updatePrivacySettings(next);
      if (!result.success) {
        setPrivacy(privacy);
        toast.error(result.error ?? '\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5');
        setSavingHint(result.error ?? '保存失败');
        return;
      }

      setSavingHint('已保存');
      setTimeout(() => setSavingHint(null), 1500);
    },
    [privacy],
  );

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    const result = await logoutUser();
    if (result.success) {
      toast.success('\u5DF2\u9000\u51FA\u767B\u5F55');
      router.push('/login');
    } else {
      toast.error(result.error ?? '\u9000\u51FA\u767B\u5F55\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5');
      setLoggingOut(false);
      setLogoutDialogOpen(false);
    }
  }, [router]);

  if (loading) {
    return <MainPageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="返回">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">设置</h1>
      </div>

      {savingHint && (
        <p className="mb-3 text-xs text-muted-foreground">{savingHint}</p>
      )}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <SectionHeader icon={<Bell className="h-4 w-4" />} title="通知设置" />
        <Card className="mb-5">
          <CardContent className="divide-y p-0">
            <SettingToggle
              id="taskReminder"
              label="任务提醒"
              description="每日 22:00 提醒完成打卡任务"
              checked={notifications.taskReminder}
              onCheckedChange={(v) => updateNotification('taskReminder', v)}
            />
            <SettingToggle
              id="socialNotifications"
              label="社交通知"
              description="收到点赞、评论时通知"
              checked={notifications.socialNotifications}
              onCheckedChange={(v) => updateNotification('socialNotifications', v)}
            />
            <SettingToggle
              id="systemNotifications"
              label="系统通知"
              description="系统公告和维护通知"
              checked={notifications.systemNotifications}
              onCheckedChange={(v) => updateNotification('systemNotifications', v)}
            />
            <SettingToggle
              id="challengeNotifications"
              label="挑战通知"
              description="挑战进度和奖励发放通知"
              checked={notifications.challengeNotifications}
              onCheckedChange={(v) => updateNotification('challengeNotifications', v)}
            />
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <SectionHeader icon={<Shield className="h-4 w-4" />} title="隐私设置" />
        <Card className="mb-5">
          <CardContent className="divide-y p-0">
            <SettingToggle
              id="showOnLeaderboard"
              label="排行榜展示"
              description="允许在挑战排行榜中显示"
              checked={privacy.showOnLeaderboard}
              onCheckedChange={(v) => updatePrivacy('showOnLeaderboard', v)}
            />
            <SettingToggle
              id="publicProfile"
              label="公开动态"
              description="允许他人查看你的饮食动态"
              checked={privacy.publicProfile}
              onCheckedChange={(v) => updatePrivacy('publicProfile', v)}
            />
            <SettingToggle
              id="allowSearch"
              label="允许搜索"
              description="允许其他用户搜索到你"
              checked={privacy.allowSearch}
              onCheckedChange={(v) => updatePrivacy('allowSearch', v)}
            />
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <SectionHeader icon={<User className="h-4 w-4" />} title="账号设置" />
        <Card className="mb-5">
          <CardContent className="divide-y p-0">
            <AccountRow
              icon={<Smartphone className="h-4 w-4 text-muted-foreground" />}
              label="手机号"
              value={account.phone || '未绑定'}
            />
            <AccountRow
              icon={<MessageCircle className="h-4 w-4 text-muted-foreground" />}
              label="微信"
              value={account.wechatBound ? '已绑定' : '未绑定'}
            />
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
      >
        <Button
          variant="outline"
          className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setLogoutDialogOpen(true)}
        >
          <LogOut className="mr-2 h-4 w-4" />
          退出登录
        </Button>
      </motion.div>

      <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认退出</DialogTitle>
            <DialogDescription>
              退出登录后需要重新验证才能使用应用，确认继续吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setLogoutDialogOpen(false)} disabled={loggingOut}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleLogout} disabled={loggingOut}>
              {loggingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              确认退出
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-2 flex items-center gap-2 px-1">
      {icon}
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
    </div>
  );
}

function SettingToggle({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <div className="flex-1 pr-4">
        <Label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function AccountRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="text-sm text-muted-foreground">{value}</span>
    </div>
  );
}

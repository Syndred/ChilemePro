/**
 * Push Notification Builder - 推送通知构建器
 * Pure functions to build notification payloads for different notification types.
 * Requirement 17.4: Support push notifications
 * Requirement 10.9: Send task reminder at 22:00
 * Requirement 15.4: Send notification on likes/comments
 */

// --- Types ---

export type NotificationType = 'task_reminder' | 'social_like' | 'social_comment' | 'system' | 'challenge';

export interface NotificationPayload {
  title: string;
  body: string;
  icon: string;
  badge: string;
  tag: string;
  data: NotificationData;
  /** Whether to renotify if a notification with the same tag exists */
  renotify: boolean;
  /** Whether the notification requires interaction to dismiss */
  requireInteraction: boolean;
}

export interface NotificationData {
  type: NotificationType;
  url: string;
  timestamp: number;
  [key: string]: unknown;
}

// --- Constants ---

const DEFAULT_ICON = '/icons/icon-192x192.png';
const DEFAULT_BADGE = '/icons/icon-72x72.png';

/** URL mapping for each notification type */
const NOTIFICATION_URLS: Record<NotificationType, string> = {
  task_reminder: '/challenge',
  social_like: '/social',
  social_comment: '/social',
  system: '/',
  challenge: '/challenge',
};

// --- Task Reminder (22:00) ---

export interface TaskReminderInput {
  /** Number of incomplete tasks remaining */
  incompleteTasks: number;
  /** Current day in the challenge (1-7) */
  challengeDay: number;
  /** Reward amount for today */
  todayReward: number;
}

/**
 * Build a task reminder notification payload (sent at 22:00).
 * Requirement 10.9: Send task reminder at 22:00 to users who haven't completed tasks.
 */
export function buildTaskReminderPayload(input: TaskReminderInput, timestamp?: number): NotificationPayload {
  const { incompleteTasks, challengeDay, todayReward } = input;

  const body = incompleteTasks > 0
    ? `今日还有 ${incompleteTasks} 项任务未完成，完成可获得 ¥${todayReward} 返现。挑战第 ${challengeDay} 天，加油！`
    : `今日任务已全部完成！挑战第 ${challengeDay} 天，继续保持！`;

  return {
    title: '⏰ 打卡提醒',
    body,
    icon: DEFAULT_ICON,
    badge: DEFAULT_BADGE,
    tag: `task-reminder-day-${challengeDay}`,
    data: {
      type: 'task_reminder',
      url: NOTIFICATION_URLS.task_reminder,
      timestamp: timestamp ?? Date.now(),
      challengeDay,
      incompleteTasks,
    },
    renotify: true,
    requireInteraction: incompleteTasks > 0,
  };
}

// --- Social Notifications ---

export interface SocialLikeInput {
  /** Name of the user who liked */
  likerName: string;
  /** ID of the post that was liked */
  postId: string;
}

/**
 * Build a social like notification payload.
 * Requirement 15.4: Send notification when user receives a like.
 */
export function buildSocialLikePayload(input: SocialLikeInput, timestamp?: number): NotificationPayload {
  const { likerName, postId } = input;

  return {
    title: '👍 收到点赞',
    body: `${likerName} 赞了你的动态`,
    icon: DEFAULT_ICON,
    badge: DEFAULT_BADGE,
    tag: `social-like-${postId}`,
    data: {
      type: 'social_like',
      url: NOTIFICATION_URLS.social_like,
      timestamp: timestamp ?? Date.now(),
      postId,
      likerName,
    },
    renotify: false,
    requireInteraction: false,
  };
}

export interface SocialCommentInput {
  /** Name of the user who commented */
  commenterName: string;
  /** ID of the post that was commented on */
  postId: string;
  /** Preview of the comment content (truncated) */
  commentPreview: string;
}

/**
 * Build a social comment notification payload.
 * Requirement 15.4: Send notification when user receives a comment.
 */
export function buildSocialCommentPayload(input: SocialCommentInput, timestamp?: number): NotificationPayload {
  const { commenterName, postId, commentPreview } = input;
  const truncated = truncateText(commentPreview, 50);

  return {
    title: '💬 收到评论',
    body: `${commenterName}: ${truncated}`,
    icon: DEFAULT_ICON,
    badge: DEFAULT_BADGE,
    tag: `social-comment-${postId}`,
    data: {
      type: 'social_comment',
      url: NOTIFICATION_URLS.social_comment,
      timestamp: timestamp ?? Date.now(),
      postId,
      commenterName,
    },
    renotify: true,
    requireInteraction: false,
  };
}

// --- System Notifications ---

export interface SystemNotificationInput {
  /** Title of the system notification */
  title: string;
  /** Body message */
  message: string;
  /** Optional URL to navigate to */
  url?: string;
}

/**
 * Build a system notification payload.
 * Requirement 24.3: Notify affected users when outage exceeds 2 hours.
 */
export function buildSystemNotificationPayload(input: SystemNotificationInput, timestamp?: number): NotificationPayload {
  const { title, message, url } = input;

  return {
    title: `📢 ${title}`,
    body: message,
    icon: DEFAULT_ICON,
    badge: DEFAULT_BADGE,
    tag: `system-${(timestamp ?? Date.now())}`,
    data: {
      type: 'system',
      url: url ?? NOTIFICATION_URLS.system,
      timestamp: timestamp ?? Date.now(),
    },
    renotify: true,
    requireInteraction: true,
  };
}

// --- Challenge Notifications ---

export interface ChallengeNotificationInput {
  /** Title of the challenge notification */
  title: string;
  /** Body message */
  message: string;
  /** Challenge ID */
  challengeId: string;
}

/**
 * Build a challenge notification payload (reward distribution, challenge updates).
 */
export function buildChallengeNotificationPayload(input: ChallengeNotificationInput, timestamp?: number): NotificationPayload {
  const { title, message, challengeId } = input;

  return {
    title: `🏆 ${title}`,
    body: message,
    icon: DEFAULT_ICON,
    badge: DEFAULT_BADGE,
    tag: `challenge-${challengeId}`,
    data: {
      type: 'challenge',
      url: NOTIFICATION_URLS.challenge,
      timestamp: timestamp ?? Date.now(),
      challengeId,
    },
    renotify: true,
    requireInteraction: false,
  };
}

// --- Filtering ---

export interface NotificationFilter {
  taskReminder: boolean;
  socialNotifications: boolean;
  systemNotifications: boolean;
  challengeNotifications: boolean;
}

/**
 * Check if a notification should be shown based on user's notification settings.
 * Returns true if the notification should be displayed.
 */
export function shouldShowNotification(
  type: NotificationType,
  filter: NotificationFilter,
): boolean {
  switch (type) {
    case 'task_reminder':
      return filter.taskReminder;
    case 'social_like':
    case 'social_comment':
      return filter.socialNotifications;
    case 'system':
      return filter.systemNotifications;
    case 'challenge':
      return filter.challengeNotifications;
    default:
      return false;
  }
}

/**
 * Get the navigation URL for a notification type.
 */
export function getNotificationUrl(type: NotificationType): string {
  return NOTIFICATION_URLS[type] ?? '/';
}

// --- Helpers ---

/**
 * Truncate text to a maximum length, appending "..." if truncated.
 */
export function truncateText(text: string, maxLength: number): string {
  if (maxLength < 0) return '';
  if (text.length <= maxLength) return text;
  if (maxLength <= 3) return text.slice(0, maxLength);
  return text.slice(0, maxLength - 3) + '...';
}

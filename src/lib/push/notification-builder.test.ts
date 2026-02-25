import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  buildTaskReminderPayload,
  buildSocialLikePayload,
  buildSocialCommentPayload,
  buildSystemNotificationPayload,
  buildChallengeNotificationPayload,
  shouldShowNotification,
  getNotificationUrl,
  truncateText,
  type NotificationType,
  type NotificationFilter,
  type NotificationPayload,
} from './notification-builder';

// --- Helpers ---

function isValidPayload(payload: NotificationPayload): boolean {
  return (
    typeof payload.title === 'string' &&
    payload.title.length > 0 &&
    typeof payload.body === 'string' &&
    typeof payload.icon === 'string' &&
    payload.icon.length > 0 &&
    typeof payload.badge === 'string' &&
    payload.badge.length > 0 &&
    typeof payload.tag === 'string' &&
    payload.tag.length > 0 &&
    typeof payload.data === 'object' &&
    payload.data !== null &&
    typeof payload.data.type === 'string' &&
    typeof payload.data.url === 'string' &&
    typeof payload.data.timestamp === 'number' &&
    typeof payload.renotify === 'boolean' &&
    typeof payload.requireInteraction === 'boolean'
  );
}

// --- Arbitraries ---

const notificationTypeArb: fc.Arbitrary<NotificationType> = fc.constantFrom(
  'task_reminder',
  'social_like',
  'social_comment',
  'system',
  'challenge',
);

const filterArb: fc.Arbitrary<NotificationFilter> = fc.record({
  taskReminder: fc.boolean(),
  socialNotifications: fc.boolean(),
  systemNotifications: fc.boolean(),
  challengeNotifications: fc.boolean(),
});

// --- Tests ---

describe('notification-builder', () => {
  describe('truncateText', () => {
    it('should return text unchanged if within limit', () => {
      expect(truncateText('hello', 10)).toBe('hello');
    });

    it('should truncate and add ellipsis when text exceeds limit', () => {
      expect(truncateText('hello world', 8)).toBe('hello...');
    });

    it('should handle empty string', () => {
      expect(truncateText('', 5)).toBe('');
    });

    it('should handle maxLength <= 3', () => {
      expect(truncateText('abcdef', 3)).toBe('abc');
      expect(truncateText('abcdef', 1)).toBe('a');
    });

    it('should handle negative maxLength', () => {
      expect(truncateText('hello', -1)).toBe('');
    });

    it('property: output length never exceeds maxLength', () => {
      fc.assert(
        fc.property(
          fc.string(),
          fc.integer({ min: 0, max: 200 }),
          (text, maxLength) => {
            const result = truncateText(text, maxLength);
            expect(result.length).toBeLessThanOrEqual(maxLength);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('property: text within limit is returned unchanged', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.integer({ min: 50, max: 200 }),
          (text, maxLength) => {
            expect(truncateText(text, maxLength)).toBe(text);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('buildTaskReminderPayload', () => {
    it('should build payload for incomplete tasks', () => {
      const payload = buildTaskReminderPayload({
        incompleteTasks: 2,
        challengeDay: 3,
        todayReward: 10,
      });

      expect(payload.title).toBe('⏰ 打卡提醒');
      expect(payload.body).toContain('2 项任务未完成');
      expect(payload.body).toContain('¥10');
      expect(payload.body).toContain('第 3 天');
      expect(payload.data.type).toBe('task_reminder');
      expect(payload.data.url).toBe('/challenge');
      expect(payload.requireInteraction).toBe(true);
      expect(isValidPayload(payload)).toBe(true);
    });

    it('should build payload for completed tasks', () => {
      const payload = buildTaskReminderPayload({
        incompleteTasks: 0,
        challengeDay: 5,
        todayReward: 15,
      });

      expect(payload.body).toContain('已全部完成');
      expect(payload.requireInteraction).toBe(false);
    });

    it('should use provided timestamp', () => {
      const ts = 1700000000000;
      const payload = buildTaskReminderPayload(
        { incompleteTasks: 1, challengeDay: 1, todayReward: 6 },
        ts,
      );
      expect(payload.data.timestamp).toBe(ts);
    });

    it('property: always produces valid payload', () => {
      fc.assert(
        fc.property(
          fc.record({
            incompleteTasks: fc.integer({ min: 0, max: 10 }),
            challengeDay: fc.integer({ min: 1, max: 7 }),
            todayReward: fc.integer({ min: 1, max: 100 }),
          }),
          (input) => {
            const payload = buildTaskReminderPayload(input);
            expect(isValidPayload(payload)).toBe(true);
            expect(payload.data.type).toBe('task_reminder');
          },
        ),
        { numRuns: 100 },
      );
    });

    it('property: requireInteraction is true iff incompleteTasks > 0', () => {
      fc.assert(
        fc.property(
          fc.record({
            incompleteTasks: fc.integer({ min: 0, max: 10 }),
            challengeDay: fc.integer({ min: 1, max: 7 }),
            todayReward: fc.integer({ min: 1, max: 100 }),
          }),
          (input) => {
            const payload = buildTaskReminderPayload(input);
            expect(payload.requireInteraction).toBe(input.incompleteTasks > 0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('buildSocialLikePayload', () => {
    it('should build like notification payload', () => {
      const payload = buildSocialLikePayload({
        likerName: '小明',
        postId: 'post-123',
      });

      expect(payload.title).toBe('👍 收到点赞');
      expect(payload.body).toContain('小明');
      expect(payload.data.type).toBe('social_like');
      expect(payload.data.url).toBe('/social');
      expect(payload.tag).toBe('social-like-post-123');
      expect(isValidPayload(payload)).toBe(true);
    });

    it('property: always produces valid payload with correct type', () => {
      fc.assert(
        fc.property(
          fc.record({
            likerName: fc.string({ minLength: 1, maxLength: 20 }),
            postId: fc.string({ minLength: 1, maxLength: 36 }),
          }),
          (input) => {
            const payload = buildSocialLikePayload(input);
            expect(isValidPayload(payload)).toBe(true);
            expect(payload.data.type).toBe('social_like');
            expect(payload.body).toContain(input.likerName);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('buildSocialCommentPayload', () => {
    it('should build comment notification with truncated preview', () => {
      const longComment = '这是一条非常长的评论内容，超过了五十个字符的限制，需要被截断显示以保持通知的简洁性';
      const payload = buildSocialCommentPayload({
        commenterName: '小红',
        postId: 'post-456',
        commentPreview: longComment,
      });

      expect(payload.title).toBe('💬 收到评论');
      expect(payload.body).toContain('小红');
      expect(payload.body.length).toBeLessThanOrEqual(60); // name + ": " + truncated(50)
      expect(payload.data.type).toBe('social_comment');
      expect(payload.renotify).toBe(true);
      expect(isValidPayload(payload)).toBe(true);
    });

    it('should not truncate short comments', () => {
      const payload = buildSocialCommentPayload({
        commenterName: '小红',
        postId: 'post-456',
        commentPreview: '好吃！',
      });

      expect(payload.body).toBe('小红: 好吃！');
    });

    it('property: comment preview in body is at most 50 chars', () => {
      fc.assert(
        fc.property(
          fc.record({
            commenterName: fc.string({ minLength: 1, maxLength: 20 }),
            postId: fc.string({ minLength: 1, maxLength: 36 }),
            commentPreview: fc.string({ minLength: 0, maxLength: 500 }),
          }),
          (input) => {
            const payload = buildSocialCommentPayload(input);
            expect(isValidPayload(payload)).toBe(true);
            // Body format: "name: truncated_comment"
            const commentPart = payload.body.slice(input.commenterName.length + 2);
            expect(commentPart.length).toBeLessThanOrEqual(50);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('buildSystemNotificationPayload', () => {
    it('should build system notification', () => {
      const payload = buildSystemNotificationPayload({
        title: '系统维护',
        message: '系统将于今晚 23:00 进行维护',
      });

      expect(payload.title).toBe('📢 系统维护');
      expect(payload.body).toBe('系统将于今晚 23:00 进行维护');
      expect(payload.data.type).toBe('system');
      expect(payload.data.url).toBe('/');
      expect(payload.requireInteraction).toBe(true);
      expect(isValidPayload(payload)).toBe(true);
    });

    it('should use custom URL when provided', () => {
      const payload = buildSystemNotificationPayload({
        title: '故障通知',
        message: '系统故障已修复',
        url: '/status',
      });

      expect(payload.data.url).toBe('/status');
    });

    it('property: always produces valid payload', () => {
      fc.assert(
        fc.property(
          fc.record({
            title: fc.string({ minLength: 1, maxLength: 50 }),
            message: fc.string({ minLength: 1, maxLength: 200 }),
          }),
          (input) => {
            const payload = buildSystemNotificationPayload(input);
            expect(isValidPayload(payload)).toBe(true);
            expect(payload.data.type).toBe('system');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('buildChallengeNotificationPayload', () => {
    it('should build challenge notification', () => {
      const payload = buildChallengeNotificationPayload({
        title: '奖励发放',
        message: '您的挑战奖励 ¥29 已发放',
        challengeId: 'ch-789',
      });

      expect(payload.title).toBe('🏆 奖励发放');
      expect(payload.body).toContain('¥29');
      expect(payload.data.type).toBe('challenge');
      expect(payload.data.url).toBe('/challenge');
      expect(payload.tag).toBe('challenge-ch-789');
      expect(isValidPayload(payload)).toBe(true);
    });
  });

  describe('shouldShowNotification', () => {
    it('should filter task_reminder based on taskReminder setting', () => {
      expect(shouldShowNotification('task_reminder', {
        taskReminder: true, socialNotifications: false, systemNotifications: false, challengeNotifications: false,
      })).toBe(true);
      expect(shouldShowNotification('task_reminder', {
        taskReminder: false, socialNotifications: true, systemNotifications: true, challengeNotifications: true,
      })).toBe(false);
    });

    it('should filter social types based on socialNotifications setting', () => {
      const filterOn: NotificationFilter = {
        taskReminder: false, socialNotifications: true, systemNotifications: false, challengeNotifications: false,
      };
      const filterOff: NotificationFilter = {
        taskReminder: true, socialNotifications: false, systemNotifications: true, challengeNotifications: true,
      };

      expect(shouldShowNotification('social_like', filterOn)).toBe(true);
      expect(shouldShowNotification('social_comment', filterOn)).toBe(true);
      expect(shouldShowNotification('social_like', filterOff)).toBe(false);
      expect(shouldShowNotification('social_comment', filterOff)).toBe(false);
    });

    it('should filter system based on systemNotifications setting', () => {
      expect(shouldShowNotification('system', {
        taskReminder: false, socialNotifications: false, systemNotifications: true, challengeNotifications: false,
      })).toBe(true);
    });

    it('should filter challenge based on challengeNotifications setting', () => {
      expect(shouldShowNotification('challenge', {
        taskReminder: false, socialNotifications: false, systemNotifications: false, challengeNotifications: true,
      })).toBe(true);
    });

    it('property: all-enabled filter allows all notification types', () => {
      const allEnabled: NotificationFilter = {
        taskReminder: true,
        socialNotifications: true,
        systemNotifications: true,
        challengeNotifications: true,
      };

      fc.assert(
        fc.property(notificationTypeArb, (type) => {
          expect(shouldShowNotification(type, allEnabled)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('property: all-disabled filter blocks all notification types', () => {
      const allDisabled: NotificationFilter = {
        taskReminder: false,
        socialNotifications: false,
        systemNotifications: false,
        challengeNotifications: false,
      };

      fc.assert(
        fc.property(notificationTypeArb, (type) => {
          expect(shouldShowNotification(type, allDisabled)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });

    it('property: filtering is consistent with the corresponding setting', () => {
      fc.assert(
        fc.property(notificationTypeArb, filterArb, (type, filter) => {
          const result = shouldShowNotification(type, filter);
          switch (type) {
            case 'task_reminder':
              expect(result).toBe(filter.taskReminder);
              break;
            case 'social_like':
            case 'social_comment':
              expect(result).toBe(filter.socialNotifications);
              break;
            case 'system':
              expect(result).toBe(filter.systemNotifications);
              break;
            case 'challenge':
              expect(result).toBe(filter.challengeNotifications);
              break;
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('getNotificationUrl', () => {
    it('should return correct URLs for each type', () => {
      expect(getNotificationUrl('task_reminder')).toBe('/challenge');
      expect(getNotificationUrl('social_like')).toBe('/social');
      expect(getNotificationUrl('social_comment')).toBe('/social');
      expect(getNotificationUrl('system')).toBe('/');
      expect(getNotificationUrl('challenge')).toBe('/challenge');
    });

    it('property: always returns a non-empty string starting with /', () => {
      fc.assert(
        fc.property(notificationTypeArb, (type) => {
          const url = getNotificationUrl(type);
          expect(url.length).toBeGreaterThan(0);
          expect(url.startsWith('/')).toBe(true);
        }),
        { numRuns: 100 },
      );
    });
  });
});

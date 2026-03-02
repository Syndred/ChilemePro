import { describe, expect, it } from 'vitest';
import {
  MAX_POST_CONTENT_LENGTH,
  MAX_POST_IMAGES,
  canDeletePost,
  canFollow,
  filterFeedPosts,
  formatPostTime,
  generateNotificationMessage,
  truncateText,
  validatePost,
  validatePostContent,
  validatePostImages,
  validateReportReason,
  type FeedPost,
} from './social';

describe('validatePostContent', () => {
  it('accepts empty content', () => {
    expect(validatePostContent('').valid).toBe(true);
  });

  it('accepts content at exactly max length', () => {
    const content = 'a'.repeat(MAX_POST_CONTENT_LENGTH);
    expect(validatePostContent(content).valid).toBe(true);
  });

  it('rejects content over max length', () => {
    const content = 'a'.repeat(MAX_POST_CONTENT_LENGTH + 1);
    const result = validatePostContent(content);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(String(MAX_POST_CONTENT_LENGTH));
  });

  it('accepts normal Chinese content', () => {
    expect(validatePostContent('今天吃了鸡胸肉配西兰花').valid).toBe(true);
  });
});

describe('validatePostImages', () => {
  it('accepts empty images array', () => {
    expect(validatePostImages([]).valid).toBe(true);
  });

  it('accepts exactly max images', () => {
    const images = Array.from({ length: MAX_POST_IMAGES }, (_, i) => `https://img/${i}.jpg`);
    expect(validatePostImages(images).valid).toBe(true);
  });

  it('rejects over max images', () => {
    const images = Array.from({ length: MAX_POST_IMAGES + 1 }, (_, i) => `https://img/${i}.jpg`);
    const result = validatePostImages(images);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(String(MAX_POST_IMAGES));
  });

  it('accepts single image', () => {
    expect(validatePostImages(['https://img/1.jpg']).valid).toBe(true);
  });
});

describe('validatePost', () => {
  it('accepts valid post with content and images', () => {
    const result = validatePost({
      content: '好吃',
      images: ['https://img/1.jpg'],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts post with only content', () => {
    expect(validatePost({ content: '今天的午餐', images: [] }).valid).toBe(true);
  });

  it('accepts post with only images', () => {
    expect(validatePost({ content: '', images: ['https://img/1.jpg'] }).valid).toBe(true);
  });

  it('rejects post with no content and no images', () => {
    const result = validatePost({ content: '', images: [] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('请输入文字或上传图片');
  });

  it('rejects whitespace-only content and no images', () => {
    const result = validatePost({ content: '   ', images: [] });
    expect(result.valid).toBe(false);
  });

  it('collects multiple errors', () => {
    const result = validatePost({
      content: 'a'.repeat(MAX_POST_CONTENT_LENGTH + 1),
      images: Array.from({ length: MAX_POST_IMAGES + 1 }, (_, i) => `https://img/${i}.jpg`),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(2);
  });

  it('accepts post with mealRecordId', () => {
    expect(
      validatePost({
        content: '关联饮食记录',
        images: [],
        mealRecordId: 'record-uuid',
      }).valid,
    ).toBe(true);
  });
});

describe('canDeletePost', () => {
  it('returns true when user owns the post', () => {
    expect(canDeletePost('user-1', 'user-1')).toBe(true);
  });

  it('returns false when user does not own the post', () => {
    expect(canDeletePost('user-1', 'user-2')).toBe(false);
  });
});

describe('formatPostTime', () => {
  const now = new Date('2025-06-15T12:00:00');

  it('shows "刚刚" for less than 1 minute ago', () => {
    const created = new Date('2025-06-15T11:59:30');
    expect(formatPostTime(created, now)).toBe('刚刚');
  });

  it('shows minutes for less than 1 hour ago', () => {
    const created = new Date('2025-06-15T11:30:00');
    expect(formatPostTime(created, now)).toBe('30分钟前');
  });

  it('shows hours for less than 24 hours ago', () => {
    const created = new Date('2025-06-15T09:00:00');
    expect(formatPostTime(created, now)).toBe('3小时前');
  });

  it('shows days for less than 7 days ago', () => {
    const created = new Date('2025-06-13T12:00:00');
    expect(formatPostTime(created, now)).toBe('2天前');
  });

  it('shows date for 7+ days ago', () => {
    const created = new Date('2025-06-01T12:00:00');
    const result = formatPostTime(created, now);
    expect(result).toContain('6');
    expect(result).toContain('1');
  });
});

describe('constants', () => {
  it('MAX_POST_IMAGES is 4', () => {
    expect(MAX_POST_IMAGES).toBe(4);
  });

  it('MAX_POST_CONTENT_LENGTH is 500', () => {
    expect(MAX_POST_CONTENT_LENGTH).toBe(500);
  });
});

describe('filterFeedPosts', () => {
  const makePost = (
    id: string,
    userId: string,
    status: string,
    createdAt: Date,
  ): FeedPost => ({ id, userId, status, createdAt });

  const currentUserId = 'me';
  const followedIds = new Set(['friend-1', 'friend-2']);

  it('returns only published posts from followed users and self', () => {
    const posts = [
      makePost('p1', 'me', 'published', new Date('2025-06-15T10:00:00')),
      makePost('p2', 'friend-1', 'published', new Date('2025-06-15T09:00:00')),
      makePost('p3', 'stranger', 'published', new Date('2025-06-15T08:00:00')),
      makePost('p4', 'friend-2', 'reviewing', new Date('2025-06-15T07:00:00')),
    ];
    const result = filterFeedPosts(posts, followedIds, currentUserId);
    expect(result.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('sorts by createdAt descending', () => {
    const posts = [
      makePost('p1', 'me', 'published', new Date('2025-06-15T08:00:00')),
      makePost('p2', 'friend-1', 'published', new Date('2025-06-15T12:00:00')),
      makePost('p3', 'friend-2', 'published', new Date('2025-06-15T10:00:00')),
    ];
    const result = filterFeedPosts(posts, followedIds, currentUserId);
    expect(result.map((p) => p.id)).toEqual(['p2', 'p3', 'p1']);
  });

  it('excludes non-published posts', () => {
    const posts = [
      makePost('p1', 'me', 'rejected', new Date('2025-06-15T10:00:00')),
      makePost('p2', 'friend-1', 'reviewing', new Date('2025-06-15T09:00:00')),
    ];
    const result = filterFeedPosts(posts, followedIds, currentUserId);
    expect(result).toHaveLength(0);
  });

  it('returns empty array when no posts match', () => {
    expect(filterFeedPosts([], followedIds, currentUserId)).toEqual([]);
  });

  it('includes own posts even if not followed', () => {
    const posts = [makePost('p1', 'me', 'published', new Date('2025-06-15T10:00:00'))];
    expect(filterFeedPosts(posts, new Set(), currentUserId)).toHaveLength(1);
  });
});

describe('truncateText', () => {
  it('returns text unchanged if within limit', () => {
    expect(truncateText('hello', 10)).toBe('hello');
  });

  it('returns text unchanged if exactly at limit', () => {
    expect(truncateText('hello', 5)).toBe('hello');
  });

  it('truncates and appends ... if over limit', () => {
    expect(truncateText('hello world', 5)).toBe('hello...');
  });

  it('handles empty string', () => {
    expect(truncateText('', 10)).toBe('');
  });
});

describe('generateNotificationMessage', () => {
  it('generates like notification with preview', () => {
    const msg = generateNotificationMessage({
      type: 'like',
      actorNickname: '小明',
      postContentPreview: '今天吃了一碗面',
    });
    expect(msg).toContain('小明');
    expect(msg).toContain('点赞了');
    expect(msg).toContain('今天吃了一碗面');
  });

  it('generates like notification without preview', () => {
    const msg = generateNotificationMessage({
      type: 'like',
      actorNickname: '小明',
    });
    expect(msg).toBe('小明 点赞了你的动态');
  });

  it('generates comment notification with content', () => {
    const msg = generateNotificationMessage({
      type: 'comment',
      actorNickname: '小红',
      commentContent: '看起来很好吃',
    });
    expect(msg).toContain('小红');
    expect(msg).toContain('评论了你的动态');
    expect(msg).toContain('看起来很好吃');
  });

  it('generates comment notification without content', () => {
    const msg = generateNotificationMessage({
      type: 'comment',
      actorNickname: '小红',
    });
    expect(msg).toBe('小红 评论了你的动态');
  });

  it('generates follow notification', () => {
    const msg = generateNotificationMessage({
      type: 'follow',
      actorNickname: '小刚',
    });
    expect(msg).toBe('小刚 关注了你');
  });

  it('truncates long content preview', () => {
    const msg = generateNotificationMessage({
      type: 'like',
      actorNickname: '小明',
      postContentPreview: '这是一段非常非常非常非常非常非常非常非常长的动态内容',
    });
    expect(msg).toContain('...');
  });
});

describe('canFollow', () => {
  it('returns true for different users', () => {
    expect(canFollow('user-1', 'user-2')).toBe(true);
  });

  it('returns false when trying to follow self', () => {
    expect(canFollow('user-1', 'user-1')).toBe(false);
  });
});

describe('validateReportReason', () => {
  it('accepts valid reason', () => {
    expect(validateReportReason('内容不当').valid).toBe(true);
  });

  it('rejects empty reason', () => {
    const result = validateReportReason('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('不能为空');
  });

  it('rejects whitespace-only reason', () => {
    expect(validateReportReason('   ').valid).toBe(false);
  });

  it('rejects reason over 500 characters', () => {
    const result = validateReportReason('a'.repeat(501));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('500');
  });

  it('accepts reason at exactly 500 characters', () => {
    expect(validateReportReason('a'.repeat(500)).valid).toBe(true);
  });
});

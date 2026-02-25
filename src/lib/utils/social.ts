/**
 * Pure social business logic — no side effects, fully testable.
 *
 * Requirement 14.4: Max 9 photos per post
 * Requirement 14.5: Max 500 characters per post
 * Requirement 14.6: Users can delete their own posts
 */

// --- Constants ---

/** Maximum number of photos per post */
export const MAX_POST_IMAGES = 9;

/** Maximum content length in characters */
export const MAX_POST_CONTENT_LENGTH = 500;

// --- Types ---

export interface PostValidationResult {
  valid: boolean;
  errors: string[];
}

export interface PostContentInput {
  content: string;
  images: string[];
  mealRecordId?: string;
}

// --- Pure Functions ---

/**
 * Validate post content length.
 * Requirement 14.5: Max 500 characters.
 */
export function validatePostContent(content: string): {
  valid: boolean;
  error?: string;
} {
  if (content.length > MAX_POST_CONTENT_LENGTH) {
    return {
      valid: false,
      error: `动态内容最多${MAX_POST_CONTENT_LENGTH}字，当前${content.length}字`,
    };
  }
  return { valid: true };
}

/**
 * Validate post image count.
 * Requirement 14.4: Max 9 photos.
 */
export function validatePostImages(images: string[]): {
  valid: boolean;
  error?: string;
} {
  if (images.length > MAX_POST_IMAGES) {
    return {
      valid: false,
      error: `最多上传${MAX_POST_IMAGES}张照片，当前${images.length}张`,
    };
  }
  return { valid: true };
}

/**
 * Validate a complete post before submission.
 * Requirement 14.4, 14.5: Photo and text limits.
 */
export function validatePost(input: PostContentInput): PostValidationResult {
  const errors: string[] = [];

  const contentResult = validatePostContent(input.content);
  if (!contentResult.valid && contentResult.error) {
    errors.push(contentResult.error);
  }

  const imagesResult = validatePostImages(input.images);
  if (!imagesResult.valid && imagesResult.error) {
    errors.push(imagesResult.error);
  }

  // Must have content or images
  if (input.content.trim().length === 0 && input.images.length === 0) {
    errors.push('请输入文字或上传照片');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if a user can delete a post.
 * Requirement 14.6: Users can delete their own posts.
 */
export function canDeletePost(postUserId: string, currentUserId: string): boolean {
  return postUserId === currentUserId;
}

/**
 * Format post timestamp for display.
 * Shows relative time for recent posts, absolute date for older ones.
 */
export function formatPostTime(createdAt: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - createdAt.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;

  return createdAt.toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  });
}

// --- Notification Types ---

export type NotificationType = 'like' | 'comment' | 'follow';

export interface NotificationInput {
  type: NotificationType;
  actorNickname: string;
  /** Only for 'comment' notifications */
  commentContent?: string;
  /** Only for 'like' / 'comment' — a snippet of the post content */
  postContentPreview?: string;
}

// --- Feed Filtering Types ---

export interface FeedPost {
  id: string;
  userId: string;
  status: string;
  createdAt: Date;
}

// --- Pure Functions: Feed Filtering ---

/**
 * Filter posts to only include published posts from followed users.
 * Requirement 15.1: Show followed users' posts
 * Requirement 15.6: Sort by time descending
 */
export function filterFeedPosts(
  posts: FeedPost[],
  followedUserIds: Set<string>,
  currentUserId: string,
): FeedPost[] {
  return posts
    .filter(
      (post) =>
        post.status === 'published' &&
        (post.userId === currentUserId || followedUserIds.has(post.userId)),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// --- Pure Functions: Notification Messages ---

/** Max length for content previews in notifications */
const NOTIFICATION_PREVIEW_MAX = 20;

/**
 * Truncate text to a max length, appending "…" if truncated.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '…';
}

/**
 * Generate a human-readable notification message.
 * Requirement 15.4: Send notifications for likes and comments
 */
export function generateNotificationMessage(input: NotificationInput): string {
  const { type, actorNickname } = input;

  switch (type) {
    case 'like': {
      const preview = input.postContentPreview
        ? `"${truncateText(input.postContentPreview, NOTIFICATION_PREVIEW_MAX)}"`
        : '你的动态';
      return `${actorNickname} 赞了${preview}`;
    }
    case 'comment': {
      const comment = input.commentContent
        ? `：${truncateText(input.commentContent, NOTIFICATION_PREVIEW_MAX)}`
        : '';
      return `${actorNickname} 评论了你的动态${comment}`;
    }
    case 'follow':
      return `${actorNickname} 关注了你`;
    default:
      return `${actorNickname} 与你互动了`;
  }
}

/**
 * Check if a user can follow another user.
 * Requirement 15.5: Support follow/unfollow
 * Users cannot follow themselves.
 */
export function canFollow(currentUserId: string, targetUserId: string): boolean {
  return currentUserId !== targetUserId;
}

/**
 * Validate report reason.
 * Requirement 15.7: Support reporting
 */
export function validateReportReason(reason: string): {
  valid: boolean;
  error?: string;
} {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: '举报原因不能为空' };
  }
  if (trimmed.length > 500) {
    return { valid: false, error: '举报原因最多500字' };
  }
  return { valid: true };
}

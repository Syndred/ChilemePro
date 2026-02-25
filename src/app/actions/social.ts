'use server';

import { createClient } from '@/lib/supabase/server';
import { createPostSchema } from '@/lib/validations/social';
import { validatePost } from '@/lib/utils/social';
import type { SocialPost, Comment } from '@/types';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Map a database social_posts row to our SocialPost type.
 */
function mapSocialPost(
  row: Record<string, unknown>,
  userInfo: { nickname: string; avatar: string },
  comments: Comment[] = [],
  isLiked: boolean = false,
): SocialPost {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    user: userInfo,
    content: (row.content as string) ?? '',
    images: (row.images as string[]) ?? [],
    mealRecordId: (row.meal_record_id as string) ?? null,
    likes: Number(row.likes_count ?? 0),
    comments,
    isLiked,
    status: (row.status as SocialPost['status']) ?? 'published',
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/**
 * Create a new social post.
 * Requirement 14.1: Allow uploading photos and text
 * Requirement 14.2: Support linking Meal_Record
 * Requirement 14.3: Save to Social_Feed
 * Requirement 14.4: Max 9 photos
 * Requirement 14.5: Max 500 characters
 */
export async function createPost(
  input: unknown,
): Promise<ActionResult<SocialPost>> {
  // Zod validation
  const parsed = createPostSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { content, images, mealRecordId } = parsed.data;

  // Pure business logic validation
  const validation = validatePost({ content, images, mealRecordId });
  if (!validation.valid) {
    return { success: false, error: validation.errors[0] };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // Get user profile info
    const { data: userProfile } = await supabase
      .from('users')
      .select('nickname, avatar')
      .eq('id', user.id)
      .single();

    const nickname = (userProfile?.nickname as string) ?? '用户';
    const avatar = (userProfile?.avatar as string) ?? '';

    // Insert post
    const { data: postRow, error: postError } = await supabase
      .from('social_posts')
      .insert({
        user_id: user.id,
        content,
        images,
        meal_record_id: mealRecordId ?? null,
        status: 'published',
        likes_count: 0,
        comments_count: 0,
      })
      .select()
      .single();

    if (postError || !postRow) {
      return { success: false, error: '发布动态失败，请重试' };
    }

    return {
      success: true,
      data: mapSocialPost(postRow, { nickname, avatar }),
    };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Delete a social post.
 * Requirement 14.6: Users can delete their own posts.
 */
export async function deletePost(
  postId: string,
): Promise<ActionResult> {
  if (!postId) {
    return { success: false, error: '动态 ID 不能为空' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from('social_posts')
      .select('id, user_id')
      .eq('id', postId)
      .single();

    if (!existing || existing.user_id !== user.id) {
      return { success: false, error: '动态不存在或无权删除' };
    }

    const { error } = await supabase
      .from('social_posts')
      .delete()
      .eq('id', postId);

    if (error) {
      return { success: false, error: '删除失败，请重试' };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Like a post.
 * Requirement 15.2: Support liking posts
 * Requirement 15.4: Send notification on like
 */
export async function likePost(
  postId: string,
): Promise<ActionResult> {
  if (!postId) {
    return { success: false, error: '动态 ID 不能为空' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // Insert like (unique constraint will prevent duplicates)
    const { error: likeError } = await supabase
      .from('post_likes')
      .insert({ post_id: postId, user_id: user.id });

    if (likeError) {
      if (likeError.code === '23505') {
        return { success: false, error: '已经点赞过了' };
      }
      return { success: false, error: '点赞失败，请重试' };
    }

    // Increment likes_count
    const { data: postData } = await supabase
      .from('social_posts')
      .select('likes_count')
      .eq('id', postId)
      .single();

    if (postData) {
      await supabase
        .from('social_posts')
        .update({ likes_count: Number(postData.likes_count ?? 0) + 1 })
        .eq('id', postId);
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Unlike a post.
 * Requirement 15.2: Support liking/unliking posts
 */
export async function unlikePost(
  postId: string,
): Promise<ActionResult> {
  if (!postId) {
    return { success: false, error: '动态 ID 不能为空' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { error, count } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: '取消点赞失败，请重试' };
    }

    // Decrement likes_count
    const { data: postData } = await supabase
      .from('social_posts')
      .select('likes_count')
      .eq('id', postId)
      .single();

    if (postData) {
      const newCount = Math.max(0, Number(postData.likes_count ?? 0) - 1);
      await supabase
        .from('social_posts')
        .update({ likes_count: newCount })
        .eq('id', postId);
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Add a comment to a post.
 * Requirement 15.3: Support commenting on posts
 * Requirement 15.4: Send notification on comment
 */
export async function addComment(
  postId: string,
  content: string,
): Promise<ActionResult<Comment>> {
  if (!postId) {
    return { success: false, error: '动态 ID 不能为空' };
  }

  const trimmedContent = content?.trim();
  if (!trimmedContent) {
    return { success: false, error: '评论内容不能为空' };
  }
  if (trimmedContent.length > 500) {
    return { success: false, error: '评论最多500字' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // Get user profile
    const { data: userProfile } = await supabase
      .from('users')
      .select('nickname, avatar')
      .eq('id', user.id)
      .single();

    const nickname = (userProfile?.nickname as string) ?? '用户';
    const avatar = (userProfile?.avatar as string) ?? '';

    // Insert comment
    const { data: commentRow, error: commentError } = await supabase
      .from('post_comments')
      .insert({
        post_id: postId,
        user_id: user.id,
        content: trimmedContent,
      })
      .select()
      .single();

    if (commentError || !commentRow) {
      return { success: false, error: '评论失败，请重试' };
    }

    // Increment comments_count
    const { data: postData } = await supabase
      .from('social_posts')
      .select('comments_count')
      .eq('id', postId)
      .single();

    if (postData) {
      await supabase
        .from('social_posts')
        .update({ comments_count: Number(postData.comments_count ?? 0) + 1 })
        .eq('id', postId);
    }

    const comment: Comment = {
      id: commentRow.id as string,
      postId,
      userId: user.id,
      user: { nickname, avatar },
      content: trimmedContent,
      createdAt: new Date(commentRow.created_at as string),
    };

    return { success: true, data: comment };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Follow a user.
 * Requirement 15.5: Support following other users
 */
export async function followUser(
  targetUserId: string,
): Promise<ActionResult> {
  if (!targetUserId) {
    return { success: false, error: '用户 ID 不能为空' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    if (user.id === targetUserId) {
      return { success: false, error: '不能关注自己' };
    }

    const { error } = await supabase
      .from('user_follows')
      .insert({ follower_id: user.id, following_id: targetUserId });

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: '已经关注了该用户' };
      }
      return { success: false, error: '关注失败，请重试' };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Unfollow a user.
 * Requirement 15.5: Support unfollowing other users
 */
export async function unfollowUser(
  targetUserId: string,
): Promise<ActionResult> {
  if (!targetUserId) {
    return { success: false, error: '用户 ID 不能为空' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { error } = await supabase
      .from('user_follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', targetUserId);

    if (error) {
      return { success: false, error: '取消关注失败，请重试' };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Report a post.
 * Requirement 15.7: Support reporting inappropriate content
 */
export async function reportPost(
  postId: string,
  reason: string,
): Promise<ActionResult> {
  if (!postId) {
    return { success: false, error: '动态 ID 不能为空' };
  }

  const trimmedReason = reason?.trim();
  if (!trimmedReason) {
    return { success: false, error: '举报原因不能为空' };
  }
  if (trimmedReason.length > 500) {
    return { success: false, error: '举报原因最多500字' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // Insert moderation log
    const { error } = await supabase
      .from('content_moderation_logs')
      .insert({
        post_id: postId,
        reporter_id: user.id,
        reason: trimmedReason,
        decision: 'pending',
      });

    if (error) {
      return { success: false, error: '举报失败，请重试' };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Get feed of followed users' posts.
 * Requirement 15.1: Show followed users' posts
 * Requirement 15.6: Sort by time descending
 */
export async function getFollowedFeed(): Promise<ActionResult<SocialPost[]>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // Get followed user IDs
    const { data: follows } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', user.id);

    const followedIds = (follows ?? []).map((f) => f.following_id as string);
    // Include own posts + followed users' posts
    const userIds = [user.id, ...followedIds];

    // Fetch published posts from followed users + self
    const { data: postRows, error: postsError } = await supabase
      .from('social_posts')
      .select('*')
      .eq('status', 'published')
      .in('user_id', userIds)
      .order('created_at', { ascending: false })
      .limit(50);

    if (postsError || !postRows) {
      return { success: true, data: [] };
    }

    if (postRows.length === 0) {
      return { success: true, data: [] };
    }

    // Get unique user IDs from posts
    const postUserIds = [...new Set(postRows.map((p) => p.user_id as string))];

    // Fetch user profiles
    const { data: users } = await supabase
      .from('users')
      .select('id, nickname, avatar')
      .in('id', postUserIds);

    const userMap = new Map(
      (users ?? []).map((u) => [
        u.id as string,
        { nickname: (u.nickname as string) ?? '用户', avatar: (u.avatar as string) ?? '' },
      ]),
    );

    // Fetch likes for current user
    const postIds = postRows.map((p) => p.id as string);
    const { data: likes } = await supabase
      .from('post_likes')
      .select('post_id')
      .eq('user_id', user.id)
      .in('post_id', postIds);

    const likedPostIds = new Set((likes ?? []).map((l) => l.post_id as string));

    // Fetch comments
    const { data: commentRows } = await supabase
      .from('post_comments')
      .select('*')
      .in('post_id', postIds)
      .order('created_at', { ascending: true });

    const commentUserIds = [
      ...new Set((commentRows ?? []).map((c) => c.user_id as string)),
    ];
    const { data: commentUsers } = await supabase
      .from('users')
      .select('id, nickname, avatar')
      .in('id', commentUserIds.length > 0 ? commentUserIds : ['__none__']);

    const commentUserMap = new Map(
      (commentUsers ?? []).map((u) => [
        u.id as string,
        { nickname: (u.nickname as string) ?? '用户', avatar: (u.avatar as string) ?? '' },
      ]),
    );

    const commentsByPost = new Map<string, Comment[]>();
    for (const c of commentRows ?? []) {
      const pid = c.post_id as string;
      if (!commentsByPost.has(pid)) {
        commentsByPost.set(pid, []);
      }
      const cUser = commentUserMap.get(c.user_id as string) ?? {
        nickname: '用户',
        avatar: '',
      };
      commentsByPost.get(pid)!.push({
        id: c.id as string,
        postId: pid,
        userId: c.user_id as string,
        user: cUser,
        content: c.content as string,
        createdAt: new Date(c.created_at as string),
      });
    }

    const posts: SocialPost[] = postRows.map((row) => {
      const postUser = userMap.get(row.user_id as string) ?? {
        nickname: '用户',
        avatar: '',
      };
      return {
        id: row.id as string,
        userId: row.user_id as string,
        user: postUser,
        content: (row.content as string) ?? '',
        images: (row.images as string[]) ?? [],
        mealRecordId: (row.meal_record_id as string) ?? null,
        likes: Number(row.likes_count ?? 0),
        comments: commentsByPost.get(row.id as string) ?? [],
        isLiked: likedPostIds.has(row.id as string),
        status: (row.status as SocialPost['status']) ?? 'published',
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string),
      };
    });

    return { success: true, data: posts };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

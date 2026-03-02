'use server';

import { createClient } from '@/lib/supabase/server';
import { createPostSchema } from '@/lib/validations/social';
import { validatePost } from '@/lib/utils/social';
import { moderateContent, logModerationResult } from '@/app/actions/content-moderation';
import type { SocialPost, Comment } from '@/types';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

interface DbErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

function mapDbWriteError(error: DbErrorLike | null | undefined, fallback: string): string {
  if (!error) {
    return fallback;
  }

  switch (error.code) {
    case '42501':
      return '当前账号暂无操作权限，请重新登录后重试';
    case '23503':
      return '关联数据不存在，请刷新后重试';
    case '22P02':
      return '提交的数据格式不正确，请检查后重试';
    default:
      return fallback;
  }
}

async function ensureUserProfileRow(
  supabase: ServerSupabaseClient,
  userId: string,
): Promise<{ nickname: string; avatar: string }> {
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('nickname, avatar')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.error('Failed to query user profile row', {
      userId,
      code: profileError.code,
      message: profileError.message,
      details: profileError.details,
    });
  }

  if (profile) {
    return {
      nickname: (profile.nickname as string) ?? '用户',
      avatar: (profile.avatar as string) ?? '',
    };
  }

  const fallbackNickname = `用户${userId.slice(-4)}`;
  const { data: created, error: createError } = await supabase
    .from('users')
    .upsert(
      {
        id: userId,
        nickname: fallbackNickname,
        membership_tier: 'free',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    .select('nickname, avatar')
    .single();

  if (createError || !created) {
    console.error('Failed to create missing user profile row', {
      userId,
      code: createError?.code,
      message: createError?.message,
      details: createError?.details,
    });
    throw new Error('CREATE_USER_ROW_FAILED');
  }

  return {
    nickname: (created.nickname as string) ?? fallbackNickname,
    avatar: (created.avatar as string) ?? '',
  };
}

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

async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function createPost(input: unknown): Promise<ActionResult<SocialPost>> {
  const parsed = createPostSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { content, images, mealRecordId } = parsed.data;
  const normalizedContent = content.trim();
  const validation = validatePost({ content: normalizedContent, images, mealRecordId });
  if (!validation.valid) {
    return { success: false, error: validation.errors[0] };
  }

  try {
    const supabase = await createClient();
    const userId = await getCurrentUserId();

    if (!userId) {
      return { success: false, error: '请先登录' };
    }

    const { nickname, avatar } = await ensureUserProfileRow(supabase, userId);
    const moderation = await moderateContent(normalizedContent, images);
    const allowed = moderation.success ? moderation.data?.allowed !== false : true;
    const aiResult = moderation.success ? moderation.data?.aiResult : undefined;
    const nextStatus = allowed ? 'published' : 'rejected';

    const { data: postRow, error: postError } = await supabase
      .from('social_posts')
      .insert({
        user_id: userId,
        content: normalizedContent,
        images,
        meal_record_id: mealRecordId ?? null,
        status: nextStatus,
        likes_count: 0,
        comments_count: 0,
      })
      .select()
      .single();

    if (postError || !postRow) {
      console.error('createPost insert failed', {
        userId,
        code: postError?.code,
        message: postError?.message,
        details: postError?.details,
      });
      return {
        success: false,
        error: mapDbWriteError(postError, '发布动态失败，请稍后重试'),
      };
    }

    if (aiResult) {
      await logModerationResult(postRow.id as string, aiResult);
    }

    if (!allowed) {
      return { success: false, error: '内容审核未通过，请调整后再发布' };
    }

    return {
      success: true,
      data: mapSocialPost(
        {
          ...postRow,
          status: 'published',
          updated_at: new Date().toISOString(),
        },
        { nickname, avatar },
      ),
    };
  } catch (error) {
    console.error('createPost unexpected error', error);
    return { success: false, error: '服务器错误，请稍后重试' };
  }
}

export async function deletePost(postId: string): Promise<ActionResult> {
  if (!postId) {
    return { success: false, error: '动态 ID 不能为空' };
  }

  try {
    const supabase = await createClient();
    const userId = await getCurrentUserId();

    if (!userId) {
      return { success: false, error: '请先登录' };
    }

    const { data: existing } = await supabase
      .from('social_posts')
      .select('id, user_id')
      .eq('id', postId)
      .single();

    if (!existing || existing.user_id !== userId) {
      return { success: false, error: '动态不存在或无权限删除' };
    }

    const { error } = await supabase.from('social_posts').delete().eq('id', postId);
    if (error) {
      return { success: false, error: '删除失败，请重试' };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误，请稍后重试' };
  }
}

export async function likePost(postId: string): Promise<ActionResult> {
  if (!postId) {
    return { success: false, error: '动态 ID 不能为空' };
  }

  try {
    const supabase = await createClient();
    const userId = await getCurrentUserId();

    if (!userId) {
      return { success: false, error: '请先登录' };
    }

    await ensureUserProfileRow(supabase, userId);

    const { error: likeError } = await supabase
      .from('post_likes')
      .insert({ post_id: postId, user_id: userId });

    if (likeError) {
      if (likeError.code === '23505') {
        return { success: false, error: '已点赞' };
      }
      console.error('likePost failed', {
        postId,
        userId,
        code: likeError.code,
        message: likeError.message,
        details: likeError.details,
      });
      return { success: false, error: mapDbWriteError(likeError, '点赞失败，请重试') };
    }

    const { data: postData } = await supabase
      .from('social_posts')
      .select('likes_count')
      .eq('id', postId)
      .single();

    await supabase
      .from('social_posts')
      .update({ likes_count: Number(postData?.likes_count ?? 0) + 1 })
      .eq('id', postId);

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误，请稍后重试' };
  }
}

export async function unlikePost(postId: string): Promise<ActionResult> {
  if (!postId) {
    return { success: false, error: '动态 ID 不能为空' };
  }

  try {
    const supabase = await createClient();
    const userId = await getCurrentUserId();

    if (!userId) {
      return { success: false, error: '请先登录' };
    }

    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);

    if (error) {
      return { success: false, error: '取消点赞失败，请重试' };
    }

    const { data: postData } = await supabase
      .from('social_posts')
      .select('likes_count')
      .eq('id', postId)
      .single();

    const nextCount = Math.max(0, Number(postData?.likes_count ?? 0) - 1);
    await supabase.from('social_posts').update({ likes_count: nextCount }).eq('id', postId);

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误，请稍后重试' };
  }
}

export async function addComment(postId: string, content: string): Promise<ActionResult<Comment>> {
  if (!postId) {
    return { success: false, error: '动态 ID 不能为空' };
  }

  const trimmed = content?.trim();
  if (!trimmed) {
    return { success: false, error: '评论内容不能为空' };
  }
  if (trimmed.length > 500) {
    return { success: false, error: '评论最多 500 字' };
  }

  try {
    const supabase = await createClient();
    const userId = await getCurrentUserId();

    if (!userId) {
      return { success: false, error: '请先登录' };
    }

    const { nickname, avatar } = await ensureUserProfileRow(supabase, userId);

    const { data: commentRow, error: commentError } = await supabase
      .from('post_comments')
      .insert({ post_id: postId, user_id: userId, content: trimmed })
      .select()
      .single();

    if (commentError || !commentRow) {
      console.error('addComment failed', {
        postId,
        userId,
        code: commentError?.code,
        message: commentError?.message,
        details: commentError?.details,
      });
      return { success: false, error: mapDbWriteError(commentError, '评论失败，请重试') };
    }

    const { data: postData } = await supabase
      .from('social_posts')
      .select('comments_count')
      .eq('id', postId)
      .single();

    await supabase
      .from('social_posts')
      .update({ comments_count: Number(postData?.comments_count ?? 0) + 1 })
      .eq('id', postId);

    return {
      success: true,
      data: {
        id: commentRow.id as string,
        postId,
        userId,
        user: { nickname, avatar },
        content: trimmed,
        createdAt: new Date(commentRow.created_at as string),
      },
    };
  } catch {
    return { success: false, error: '服务器错误，请稍后重试' };
  }
}

export async function followUser(targetUserId: string): Promise<ActionResult> {
  if (!targetUserId) {
    return { success: false, error: '用户 ID 不能为空' };
  }

  try {
    const supabase = await createClient();
    const userId = await getCurrentUserId();

    if (!userId) {
      return { success: false, error: '请先登录' };
    }

    if (userId === targetUserId) {
      return { success: false, error: '不能关注自己' };
    }

    await ensureUserProfileRow(supabase, userId);

    const { error } = await supabase
      .from('user_follows')
      .insert({ follower_id: userId, following_id: targetUserId });

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: '已关注该用户' };
      }
      console.error('followUser failed', {
        userId,
        targetUserId,
        code: error.code,
        message: error.message,
        details: error.details,
      });
      return { success: false, error: mapDbWriteError(error, '关注失败，请重试') };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误，请稍后重试' };
  }
}

export async function unfollowUser(targetUserId: string): Promise<ActionResult> {
  if (!targetUserId) {
    return { success: false, error: '用户 ID 不能为空' };
  }

  try {
    const supabase = await createClient();
    const userId = await getCurrentUserId();

    if (!userId) {
      return { success: false, error: '请先登录' };
    }

    const { error } = await supabase
      .from('user_follows')
      .delete()
      .eq('follower_id', userId)
      .eq('following_id', targetUserId);

    if (error) {
      return { success: false, error: '取消关注失败，请重试' };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误，请稍后重试' };
  }
}

export async function reportPost(postId: string, reason: string): Promise<ActionResult> {
  if (!postId) {
    return { success: false, error: '动态 ID 不能为空' };
  }

  const trimmedReason = reason?.trim();
  if (!trimmedReason) {
    return { success: false, error: '举报原因不能为空' };
  }
  if (trimmedReason.length > 500) {
    return { success: false, error: '举报原因最多 500 字' };
  }

  try {
    const supabase = await createClient();
    const userId = await getCurrentUserId();

    if (!userId) {
      return { success: false, error: '请先登录' };
    }

    await ensureUserProfileRow(supabase, userId);

    const { error } = await supabase.from('content_moderation_logs').insert({
      post_id: postId,
      reporter_id: userId,
      reason: trimmedReason,
      decision: 'pending',
    });

    if (error) {
      console.error('reportPost failed', {
        postId,
        userId,
        code: error.code,
        message: error.message,
        details: error.details,
      });
      return { success: false, error: mapDbWriteError(error, '举报失败，请重试') };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误，请稍后重试' };
  }
}

export async function getFollowedFeed(): Promise<ActionResult<SocialPost[]>> {
  try {
    const supabase = await createClient();
    const userId = await getCurrentUserId();

    if (!userId) {
      return { success: false, error: '请先登录' };
    }

    const { data: follows } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', userId);

    const followedIds = (follows ?? []).map((row) => row.following_id as string);
    const userIds = [userId, ...followedIds];

    const { data: postRows, error: postsError } = await supabase
      .from('social_posts')
      .select('*')
      .eq('status', 'published')
      .in('user_id', userIds)
      .order('created_at', { ascending: false })
      .limit(50);

    if (postsError || !postRows || postRows.length === 0) {
      return { success: true, data: [] };
    }

    const postUserIds = [...new Set(postRows.map((row) => row.user_id as string))];
    const postIds = postRows.map((row) => row.id as string);

    const [{ data: users }, { data: likes }, { data: commentRows }] = await Promise.all([
      supabase.from('users').select('id, nickname, avatar').in('id', postUserIds),
      supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', userId)
        .in('post_id', postIds),
      supabase
        .from('post_comments')
        .select('*')
        .in('post_id', postIds)
        .order('created_at', { ascending: true }),
    ]);

    const userMap = new Map(
      (users ?? []).map((row) => [
        row.id as string,
        {
          nickname: (row.nickname as string) ?? '用户',
          avatar: (row.avatar as string) ?? '',
        },
      ]),
    );

    const likedPostIds = new Set((likes ?? []).map((row) => row.post_id as string));

    const commentUserIds = [...new Set((commentRows ?? []).map((row) => row.user_id as string))];
    const { data: commentUsers } = await supabase
      .from('users')
      .select('id, nickname, avatar')
      .in('id', commentUserIds.length > 0 ? commentUserIds : ['__none__']);

    const commentUserMap = new Map(
      (commentUsers ?? []).map((row) => [
        row.id as string,
        {
          nickname: (row.nickname as string) ?? '用户',
          avatar: (row.avatar as string) ?? '',
        },
      ]),
    );

    const commentsByPost = new Map<string, Comment[]>();
    for (const comment of commentRows ?? []) {
      const pid = comment.post_id as string;
      if (!commentsByPost.has(pid)) {
        commentsByPost.set(pid, []);
      }

      const commentUser = commentUserMap.get(comment.user_id as string) ?? {
        nickname: '用户',
        avatar: '',
      };

      commentsByPost.get(pid)!.push({
        id: comment.id as string,
        postId: pid,
        userId: comment.user_id as string,
        user: commentUser,
        content: comment.content as string,
        createdAt: new Date(comment.created_at as string),
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
    return { success: false, error: '服务器错误，请稍后重试' };
  }
}

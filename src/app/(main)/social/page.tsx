'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Loader2, Sparkles, Users } from 'lucide-react';
import FeedCard from '@/components/social/FeedCard';
import CreatePost from '@/components/social/CreatePost';
import { SocialPageSkeleton } from '@/components/skeleton/PageSkeletons';
import {
  addComment,
  createPost,
  deleteComment,
  deletePost,
  getFollowedFeed,
  likePost,
  unlikePost,
} from '@/app/actions/social';
import { createClient } from '@/lib/supabase/client';
import type { SocialPost } from '@/types';

async function fetchCurrentUserId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

const SOCIAL_FEED_QUERY_KEY = ['socialFeed', 'followed'] as const;

function listContains(list: string[], id: string): boolean {
  return list.includes(id);
}

function addToList(list: string[], id: string): string[] {
  return listContains(list, id) ? list : [...list, id];
}

function removeFromList(list: string[], id: string): string[] {
  return list.filter((item) => item !== id);
}

interface CommentSubmitResult {
  success: boolean;
  error?: string;
}

export default function SocialPage() {
  const [pageError, setPageError] = useState<string | null>(null);
  const [deletingPostIds, setDeletingPostIds] = useState<string[]>([]);
  const [likingPostIds, setLikingPostIds] = useState<string[]>([]);
  const [submittingCommentPostIds, setSubmittingCommentPostIds] = useState<string[]>([]);
  const [deletingCommentIds, setDeletingCommentIds] = useState<string[]>([]);
  const [feedSyncingCount, setFeedSyncingCount] = useState(0);

  const feedQuery = useQuery({
    queryKey: SOCIAL_FEED_QUERY_KEY,
    queryFn: async () => {
      const result = await getFollowedFeed();
      if (!result.success) {
        throw new Error(result.error ?? '加载动态失败，请稍后重试');
      }
      return result.data ?? [];
    },
  });

  const userQuery = useQuery({
    queryKey: ['socialCurrentUser'],
    queryFn: fetchCurrentUserId,
  });

  const createMutation = useMutation({
    mutationFn: (input: { content: string; images: string[] }) => createPost(input),
  });

  const deleteMutation = useMutation({
    mutationFn: (postId: string) => deletePost(postId),
  });

  const likeMutation = useMutation({
    mutationFn: ({ postId, isLiked }: { postId: string; isLiked: boolean }) =>
      isLiked ? unlikePost(postId) : likePost(postId),
  });

  const commentMutation = useMutation({
    mutationFn: ({ postId, content }: { postId: string; content: string }) =>
      addComment(postId, content),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => deleteComment(commentId),
  });

  const posts = useMemo<SocialPost[]>(() => feedQuery.data ?? [], [feedQuery.data]);
  const currentUserId = userQuery.data ?? undefined;
  const isLoading = feedQuery.isLoading || userQuery.isLoading;
  const isFeedSyncing = feedSyncingCount > 0;

  const syncFeedWithLoading = async (): Promise<boolean> => {
    setFeedSyncingCount((prev) => prev + 1);
    try {
      const refreshed = await feedQuery.refetch();
      if (refreshed.error) {
        throw refreshed.error;
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '同步动态失败，请稍后重试';
      setPageError(message);
      return false;
    } finally {
      setFeedSyncingCount((prev) => Math.max(0, prev - 1));
    }
  };

  const handleCreatePost = async (input: {
    content: string;
    images: string[];
  }): Promise<{ success: boolean; error?: string }> => {
    setPageError(null);
    const result = await createMutation.mutateAsync(input);

    if (!result.success) {
      const message = result.error ?? '发布动态失败，请稍后重试';
      setPageError(message);
      return { success: false, error: message };
    }

    const synced = await syncFeedWithLoading();
    if (!synced) {
      setPageError('动态已发布，但刷新列表失败，请稍后重试');
    }

    return { success: true };
  };

  const handleDeletePost = async (postId: string) => {
    setPageError(null);
    setDeletingPostIds((prev) => addToList(prev, postId));

    try {
      const result = await deleteMutation.mutateAsync(postId);
      if (!result.success) {
        setPageError(result.error ?? '删除失败，请重试');
        return;
      }

      const synced = await syncFeedWithLoading();
      if (!synced) {
        setPageError('删除成功，但刷新列表失败，请稍后重试');
      }
    } finally {
      setDeletingPostIds((prev) => removeFromList(prev, postId));
    }
  };

  const handleToggleLike = async (postId: string, isLiked: boolean) => {
    setPageError(null);
    setLikingPostIds((prev) => addToList(prev, postId));

    try {
      const result = await likeMutation.mutateAsync({ postId, isLiked });
      if (!result.success) {
        setPageError(result.error ?? '操作失败，请重试');
        return;
      }

      const synced = await syncFeedWithLoading();
      if (!synced) {
        setPageError('操作成功，但刷新列表失败，请稍后重试');
      }
    } finally {
      setLikingPostIds((prev) => removeFromList(prev, postId));
    }
  };

  const handleAddComment = async (
    postId: string,
    content: string,
  ): Promise<CommentSubmitResult> => {
    setPageError(null);
    setSubmittingCommentPostIds((prev) => addToList(prev, postId));

    try {
      const result = await commentMutation.mutateAsync({ postId, content });
      if (!result.success) {
        const message = result.error ?? '评论失败，请重试';
        setPageError(message);
        return { success: false, error: message };
      }

      const synced = await syncFeedWithLoading();
      if (!synced) {
        return { success: false, error: '评论成功，但刷新列表失败，请重试' };
      }

      return { success: true };
    } finally {
      setSubmittingCommentPostIds((prev) => removeFromList(prev, postId));
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    setPageError(null);
    setDeletingCommentIds((prev) => addToList(prev, commentId));

    try {
      const result = await deleteCommentMutation.mutateAsync(commentId);
      if (!result.success) {
        setPageError(result.error ?? '删除评论失败，请重试');
        return;
      }

      const synced = await syncFeedWithLoading();
      if (!synced) {
        setPageError('删除评论成功，但刷新列表失败，请稍后重试');
      }
    } finally {
      setDeletingCommentIds((prev) => removeFromList(prev, commentId));
    }
  };

  if (isLoading) {
    return <SocialPageSkeleton />;
  }

  if (feedQuery.isError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {feedQuery.error instanceof Error ? feedQuery.error.message : '加载动态失败，请稍后重试'}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-5">
      <section className="overflow-hidden rounded-2xl border border-orange-200/70 bg-gradient-to-br from-amber-200 via-orange-100 to-yellow-50 p-4 shadow-[0_20px_40px_-28px_rgba(193,92,18,0.62)]">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-white/80 p-2 text-orange-600">
            <Users className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-orange-900">饮食朋友圈</h1>
            <p className="mt-1 text-sm text-orange-800/85">
              分享每日饮食、互相鼓励打卡，操作完成后会自动同步最新内容。
            </p>
          </div>
        </div>
      </section>

      {pageError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {pageError}
        </div>
      ) : null}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24 }}
      >
        <CreatePost
          onSubmit={handleCreatePost}
          isSubmitting={createMutation.isPending || isFeedSyncing}
        />
      </motion.div>

      {posts.length === 0 ? (
        <div className="rounded-2xl border border-orange-200/75 bg-gradient-to-br from-orange-50 to-amber-50 px-4 py-12 text-center text-muted-foreground">
          <Sparkles className="mx-auto mb-3 h-7 w-7 text-orange-500" />
          <p className="text-sm">暂时还没有动态，发一条让大家看到你的饮食打卡吧。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post, index) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: index * 0.03 }}
            >
              <FeedCard
                post={post}
                currentUserId={currentUserId}
                onDelete={handleDeletePost}
                onLike={(postId) => handleToggleLike(postId, !!post.isLiked)}
                onComment={handleAddComment}
                onDeleteComment={handleDeleteComment}
                isDeleting={deletingPostIds.includes(post.id)}
                isLiking={likingPostIds.includes(post.id)}
                isCommentSubmitting={submittingCommentPostIds.includes(post.id)}
                deletingCommentIds={deletingCommentIds}
              />
            </motion.div>
          ))}
        </div>
      )}

      {(createMutation.isPending ||
        deleteMutation.isPending ||
        commentMutation.isPending ||
        deleteCommentMutation.isPending ||
        likeMutation.isPending ||
        isFeedSyncing) ? (
        <p className="inline-flex items-center gap-1 text-xs text-orange-700">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          正在同步最新动态...
        </p>
      ) : null}
    </div>
  );
}
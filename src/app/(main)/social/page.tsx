'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Sparkles, Users } from 'lucide-react';
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
import { toast } from '@/lib/ui/toast';
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
  const queryClient = useQueryClient();
  const postNodeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [pageError, setPageError] = useState<string | null>(null);
  const [deletingPostIds, setDeletingPostIds] = useState<string[]>([]);
  const [likingPostIds, setLikingPostIds] = useState<string[]>([]);
  const [submittingCommentPostIds, setSubmittingCommentPostIds] = useState<string[]>([]);
  const [deletingCommentIds, setDeletingCommentIds] = useState<string[]>([]);
  const [isCreatingFlow, setIsCreatingFlow] = useState(false);
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);

  const feedQuery = useQuery({
    queryKey: SOCIAL_FEED_QUERY_KEY,
    queryFn: async () => {
      const result = await getFollowedFeed();
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to load social feed. Please try again.');
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
    mutationFn: ({ postId, nextLiked }: { postId: string; nextLiked: boolean }) =>
      nextLiked ? likePost(postId) : unlikePost(postId),
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

  const updateFeed = (updater: (current: SocialPost[]) => SocialPost[]) => {
    queryClient.setQueryData<SocialPost[]>(SOCIAL_FEED_QUERY_KEY, (current) => {
      if (!current) {
        return current;
      }
      return updater(current);
    });
  };

  const jumpToPost = (postId: string | null) => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!postId) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const target = postNodeRefs.current[postId];
    if (!target) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightPostId(postId);
    window.setTimeout(() => {
      setHighlightPostId((current) => (current === postId ? null : current));
    }, 1800);
  };

  const handleCreatePost = async (input: {
    content: string;
    images: string[];
  }): Promise<{ success: boolean; error?: string }> => {
    setIsCreatingFlow(true);
    setPageError(null);

    try {
      const result = await createMutation.mutateAsync(input);

      if (!result.success) {
        const message = result.error ?? '\u53D1\u5E03\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002';
        setPageError(message);
        toast.error(message);
        return { success: false, error: message };
      }

      const createdPostId = result.data?.id ?? null;

      if (result.data) {
        updateFeed((current) => [
          result.data!,
          ...current.filter((post) => post.id !== result.data!.id),
        ]);
      } else {
        await queryClient.invalidateQueries({ queryKey: SOCIAL_FEED_QUERY_KEY });
      }

      toast.success('\u221A \u53D1\u5E03\u6210\u529F');
      window.setTimeout(() => jumpToPost(createdPostId), 120);

      return { success: true };
    } finally {
      setIsCreatingFlow(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    setPageError(null);
    setDeletingPostIds((prev) => addToList(prev, postId));

    try {
      const result = await deleteMutation.mutateAsync(postId);
      if (!result.success) {
        const message = result.error ?? '\u5220\u9664\u52A8\u6001\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002';
        setPageError(message);
        toast.error(message);
        return;
      }

      updateFeed((current) => current.filter((post) => post.id !== postId));
      toast.success('\u5DF2\u5220\u9664\u52A8\u6001');
    } catch {
      const message = '\u5220\u9664\u52A8\u6001\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002';
      setPageError(message);
      toast.error(message);
    } finally {
      setDeletingPostIds((prev) => removeFromList(prev, postId));
    }
  };

  const handleToggleLike = async (postId: string) => {
    setPageError(null);
    setLikingPostIds((prev) => addToList(prev, postId));

    const previousFeed = queryClient.getQueryData<SocialPost[]>(SOCIAL_FEED_QUERY_KEY);
    const currentPost = previousFeed?.find((post) => post.id === postId);
    const nextLiked = !(currentPost?.isLiked ?? false);

    updateFeed((current) =>
      current.map((post) => {
        if (post.id !== postId) {
          return post;
        }

        const nextLikes = Math.max(0, post.likes + (nextLiked ? 1 : -1));
        return {
          ...post,
          isLiked: nextLiked,
          likes: nextLikes,
        };
      }),
    );

    try {
      const result = await likeMutation.mutateAsync({ postId, nextLiked });
      if (!result.success) {
        if (previousFeed) {
          queryClient.setQueryData(SOCIAL_FEED_QUERY_KEY, previousFeed);
        }
        const message = result.error ?? '\u70B9\u8D5E\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002';
        setPageError(message);
        toast.error(message);
      } else if (result.data) {
        const { isLiked, likesCount } = result.data;
        updateFeed((current) =>
          current.map((post) => {
            if (post.id !== postId) {
              return post;
            }
            return {
              ...post,
              isLiked,
              likes: Math.max(0, Number(likesCount ?? 0)),
            };
          }),
        );
      }
    } catch {
      if (previousFeed) {
        queryClient.setQueryData(SOCIAL_FEED_QUERY_KEY, previousFeed);
      }
      const message = '\u70B9\u8D5E\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002';
      setPageError(message);
      toast.error(message);
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
        const message = result.error ?? '\u8BC4\u8BBA\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002';
        setPageError(message);
        toast.error(message);
        return { success: false, error: message };
      }

      if (result.data) {
        updateFeed((current) =>
          current.map((post) => {
            if (post.id !== postId) {
              return post;
            }

            const exists = post.comments.some((comment) => comment.id === result.data!.id);
            if (exists) {
              return post;
            }

            return {
              ...post,
              comments: [...post.comments, result.data!],
            };
          }),
        );
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
        const message = result.error ?? '\u5220\u9664\u8BC4\u8BBA\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002';
        setPageError(message);
        toast.error(message);
        return;
      }

      updateFeed((current) =>
        current.map((post) => ({
          ...post,
          comments: post.comments.filter((comment) => comment.id !== commentId),
        })),
      );
      toast.success('\u5DF2\u5220\u9664\u8BC4\u8BBA');
    } catch {
      const message = '\u5220\u9664\u8BC4\u8BBA\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002';
      setPageError(message);
      toast.error(message);
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
          {feedQuery.error instanceof Error
            ? feedQuery.error.message
            : '\u52A0\u8F7D\u52A8\u6001\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002'}
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
              <h1 className="text-xl font-bold tracking-tight text-orange-900">
                {'\u597D\u53CB\u52A8\u6001\u5E7F\u573A'}
              </h1>
              <p className="mt-1 text-sm text-orange-800/85">
                {
                  '\u548C\u5173\u6CE8\u7684\u4EBA\u540C\u6B65\u4E09\u9910\u65E5\u5E38\uFF0C\u770B\u770B\u5927\u5BB6\u4ECA\u5929\u5403\u4E86\u4EC0\u4E48\u3002'
                }
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
          <CreatePost onSubmit={handleCreatePost} isSubmitting={isCreatingFlow} />
        </motion.div>

        {posts.length === 0 ? (
          <div className="rounded-2xl border border-orange-200/75 bg-gradient-to-br from-orange-50 to-amber-50 px-4 py-12 text-center text-muted-foreground">
            <Sparkles className="mx-auto mb-3 h-7 w-7 text-orange-500" />
            <p className="text-sm">
              {
                '\u8FD8\u6CA1\u6709\u6700\u65B0\u52A8\u6001\u3002\u5148\u53D1\u4E00\u6761\uFF0C\u548C\u5927\u5BB6\u5206\u4EAB\u4F60\u7684\u7F8E\u98DF\u65F6\u523B\u3002'
              }
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post, index) => (
              <motion.div
                key={post.id}
                ref={(node) => {
                  postNodeRefs.current[post.id] = node;
                }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: index * 0.03 }}
                className={
                  post.id === highlightPostId
                    ? 'rounded-2xl ring-2 ring-orange-300/80 ring-offset-2 ring-offset-white transition-all duration-300'
                    : ''
                }
              >
                <FeedCard
                  post={post}
                  currentUserId={currentUserId}
                  onDelete={handleDeletePost}
                  onLike={handleToggleLike}
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
    </div>
  );
}

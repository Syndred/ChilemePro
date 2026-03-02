'use client';

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Loader2, Users } from 'lucide-react';
import FeedCard from '@/components/social/FeedCard';
import CreatePost from '@/components/social/CreatePost';
import {
  createPost,
  deletePost,
  getFollowedFeed,
  likePost,
  unlikePost,
  addComment,
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

export default function SocialPage() {
  const queryClient = useQueryClient();

  const feedQuery = useQuery({
    queryKey: ['socialFeed', 'followed'],
    queryFn: async () => {
      const result = await getFollowedFeed();
      return result.success ? result.data ?? [] : [];
    },
  });

  const userQuery = useQuery({
    queryKey: ['socialCurrentUser'],
    queryFn: fetchCurrentUserId,
  });

  const createMutation = useMutation({
    mutationFn: (input: { content: string; images: string[] }) => createPost(input),
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['socialFeed'] });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (postId: string) => deletePost(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['socialFeed'] });
    },
  });

  const likeMutation = useMutation({
    mutationFn: async ({ postId, isLiked }: { postId: string; isLiked: boolean }) => {
      return isLiked ? unlikePost(postId) : likePost(postId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['socialFeed'] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: ({ postId, content }: { postId: string; content: string }) =>
      addComment(postId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['socialFeed'] });
    },
  });

  const posts = useMemo<SocialPost[]>(() => feedQuery.data ?? [], [feedQuery.data]);
  const currentUserId = userQuery.data ?? undefined;
  const isLoading = feedQuery.isLoading || userQuery.isLoading;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold">
        <Users className="h-6 w-6" />
        饮食朋友圈
      </h1>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="mb-6"
      >
        <CreatePost
          onSubmit={(input) => createMutation.mutateAsync(input)}
          isSubmitting={createMutation.isPending}
        />
      </motion.div>

      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Users className="mb-4 h-12 w-12" />
          <p>还没有动态，先发布第一条吧。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post, index) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
            >
              <FeedCard
                post={post}
                currentUserId={currentUserId}
                onDelete={(postId) => deleteMutation.mutate(postId)}
                onLike={(postId) =>
                  likeMutation.mutate({ postId, isLiked: !!post.isLiked })
                }
                onComment={(postId) => {
                  const content = window.prompt('请输入评论内容');
                  if (!content || !content.trim()) {
                    return;
                  }
                  commentMutation.mutate({ postId, content: content.trim() });
                }}
              />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

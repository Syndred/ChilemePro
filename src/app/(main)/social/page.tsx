'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Loader2, Users } from 'lucide-react';
import FeedCard from '@/components/social/FeedCard';
import CreatePost from '@/components/social/CreatePost';
import { createPost, deletePost } from '@/app/actions/social';
import { createClient } from '@/lib/supabase/client';
import type { SocialPost, Comment } from '@/types';

/**
 * Social feed page — displays posts and allows creating new ones.
 * Requirement 14.1: Publish posts with photos and text
 * Requirement 14.3: Save to Social_Feed
 * Requirement 14.6: Delete own posts
 */

async function fetchFeed(): Promise<{
  posts: SocialPost[];
  userId: string | null;
}> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { posts: [], userId: null };
  }

  // Fetch published posts (own + followed users)
  const { data: postRows } = await supabase
    .from('social_posts')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(50);

  if (!postRows || postRows.length === 0) {
    return { posts: [], userId: user.id };
  }

  // Get unique user IDs from posts
  const userIds = [...new Set(postRows.map((p) => p.user_id as string))];

  // Fetch user profiles
  const { data: users } = await supabase
    .from('users')
    .select('id, nickname, avatar')
    .in('id', userIds);

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

  // Get comment user profiles
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
    const postId = c.post_id as string;
    if (!commentsByPost.has(postId)) {
      commentsByPost.set(postId, []);
    }
    const commentUser = commentUserMap.get(c.user_id as string) ?? {
      nickname: '用户',
      avatar: '',
    };
    commentsByPost.get(postId)!.push({
      id: c.id as string,
      postId,
      userId: c.user_id as string,
      user: commentUser,
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

  return { posts, userId: user.id };
}

export default function SocialPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['socialFeed'],
    queryFn: fetchFeed,
  });

  const createMutation = useMutation({
    mutationFn: (input: { content: string; images: string[] }) =>
      createPost(input),
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['socialFeed'] });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (postId: string) => deletePost(postId),
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['socialFeed'] });
      }
    },
  });

  const posts = data?.posts ?? [];
  const currentUserId = data?.userId ?? undefined;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold flex items-center gap-2">
        <Users className="h-6 w-6" />
        饮食朋友圈
      </h1>

      {/* Create post */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="mb-6"
      >
        <CreatePost
          onSubmit={async (input) => {
            await createMutation.mutateAsync(input);
          }}
          isSubmitting={createMutation.isPending}
        />
        {createMutation.data?.success === false && (
          <p className="mt-2 text-sm text-destructive">
            {createMutation.data.error}
          </p>
        )}
      </motion.div>

      {/* Feed */}
      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Users className="mb-4 h-12 w-12" />
          <p>还没有动态，快来发布第一条吧！</p>
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
              />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

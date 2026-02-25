'use client';

import Image from 'next/image';
import { Heart, MessageCircle, Trash2, MoreHorizontal } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatPostTime, canDeletePost } from '@/lib/utils/social';
import type { SocialPost } from '@/types';

/**
 * FeedCard — displays a single social post in the feed.
 * Requirement 14.1: Show photos and text
 * Requirement 14.6: Allow deletion of own posts
 */

interface FeedCardProps {
  post: SocialPost;
  currentUserId?: string;
  onLike?: (postId: string) => void;
  onComment?: (postId: string) => void;
  onDelete?: (postId: string) => void;
}

export default function FeedCard({
  post,
  currentUserId,
  onLike,
  onComment,
  onDelete,
}: FeedCardProps) {
  const showDelete = currentUserId ? canDeletePost(post.userId, currentUserId) : false;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        {/* Header: avatar + nickname + time */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-full bg-muted">
              {post.user.avatar ? (
                <Image
                  src={post.user.avatar}
                  alt={post.user.nickname}
                  width={40}
                  height={40}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-medium text-muted-foreground">
                  {post.user.nickname.charAt(0)}
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-medium">{post.user.nickname}</p>
              <p className="text-xs text-muted-foreground">
                {formatPostTime(post.createdAt)}
              </p>
            </div>
          </div>

          {showDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => onDelete?.(post.id)}
              aria-label="删除动态"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Content text */}
        {post.content && (
          <p className="mb-3 text-sm leading-relaxed">{post.content}</p>
        )}

        {/* Image grid */}
        {post.images.length > 0 && (
          <div
            className={`mb-3 grid gap-1 ${
              post.images.length === 1
                ? 'grid-cols-1'
                : post.images.length <= 4
                  ? 'grid-cols-2'
                  : 'grid-cols-3'
            }`}
          >
            {post.images.map((img, index) => (
              <div
                key={index}
                className="relative aspect-square overflow-hidden rounded-md bg-muted"
              >
                <Image
                  src={img}
                  alt={`照片 ${index + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 33vw, 200px"
                />
              </div>
            ))}
          </div>
        )}

        {/* Actions: like + comment */}
        <div className="flex items-center gap-4 border-t pt-3">
          <Button
            variant="ghost"
            size="sm"
            className={`gap-1.5 ${post.isLiked ? 'text-red-500' : 'text-muted-foreground'}`}
            onClick={() => onLike?.(post.id)}
          >
            <Heart
              className={`h-4 w-4 ${post.isLiked ? 'fill-current' : ''}`}
            />
            <span className="text-xs">{post.likes > 0 ? post.likes : '赞'}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => onComment?.(post.id)}
          >
            <MessageCircle className="h-4 w-4" />
            <span className="text-xs">
              {post.comments.length > 0 ? post.comments.length : '评论'}
            </span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

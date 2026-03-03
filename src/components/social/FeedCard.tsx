'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Heart, Loader2, MessageCircle, Send, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { canDeletePost, formatPostTime } from '@/lib/utils/social';
import type { Comment, SocialPost } from '@/types';

interface CommentSubmitResult {
  success: boolean;
  error?: string;
}

interface FeedCardProps {
  post: SocialPost;
  currentUserId?: string;
  onLike?: (postId: string) => void | Promise<void>;
  onComment?: (postId: string, content: string) => Promise<CommentSubmitResult>;
  onDelete?: (postId: string) => void | Promise<void>;
  onDeleteComment?: (commentId: string) => void | Promise<void>;
  isDeleting?: boolean;
  isLiking?: boolean;
  isCommentSubmitting?: boolean;
  deletingCommentIds?: string[];
}

function getVisibleComments(comments: Comment[], showAll: boolean): Comment[] {
  if (showAll || comments.length <= 2) {
    return comments;
  }
  return comments.slice(-2);
}

export default function FeedCard({
  post,
  currentUserId,
  onLike,
  onComment,
  onDelete,
  onDeleteComment,
  isDeleting = false,
  isLiking = false,
  isCommentSubmitting = false,
  deletingCommentIds = [],
}: FeedCardProps) {
  const [commentInput, setCommentInput] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentBoxOpen, setCommentBoxOpen] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);

  const showDeletePost = currentUserId ? canDeletePost(post.userId, currentUserId) : false;
  const visibleComments = useMemo(
    () => getVisibleComments(post.comments, showAllComments),
    [post.comments, showAllComments],
  );

  const handleCommentSubmit = async () => {
    const content = commentInput.trim();
    if (!content) {
      setCommentError('请输入评论内容');
      return;
    }

    if (!onComment) {
      return;
    }

    setCommentError(null);
    const result = await onComment(post.id, content);
    if (!result.success) {
      setCommentError(result.error ?? '评论发送失败，请重试');
      return;
    }

    setCommentInput('');
    setCommentBoxOpen(false);
  };

  return (
    <Card className="relative overflow-hidden border-orange-100/80 bg-gradient-to-br from-white via-orange-50/35 to-amber-50/55 shadow-[0_12px_28px_-18px_rgba(194,106,21,0.45)]">
      {isDeleting ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 backdrop-blur-[1px]">
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-800">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            删除中...
          </span>
        </div>
      ) : null}

      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-full ring-2 ring-orange-100/80">
              {post.user.avatar ? (
                <Image
                  src={post.user.avatar}
                  alt={post.user.nickname}
                  width={40}
                  height={40}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-orange-100 text-sm font-medium text-orange-700">
                  {post.user.nickname.charAt(0)}
                </div>
              )}
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900">{post.user.nickname}</p>
              <p className="text-xs text-slate-500">{formatPostTime(post.createdAt)}</p>
            </div>
          </div>

          {showDeletePost ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-500 hover:bg-red-50 hover:text-red-600"
              onClick={() => onDelete?.(post.id)}
              disabled={isDeleting}
              aria-label="删除动态"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          ) : null}
        </div>

        {post.content ? <p className="text-sm leading-relaxed text-slate-700">{post.content}</p> : null}

        {post.images.length > 0 ? (
          <div
            className={`grid gap-1.5 ${
              post.images.length === 1
                ? 'grid-cols-1'
                : post.images.length <= 4
                  ? 'grid-cols-2'
                  : 'grid-cols-3'
            }`}
          >
            {post.images.map((img, index) => (
              <div
                key={`${img.slice(0, 24)}-${index}`}
                className="relative aspect-square overflow-hidden rounded-lg bg-slate-100"
              >
                <Image
                  src={img}
                  alt={`动态图片 ${index + 1}`}
                  fill
                  unoptimized
                  className="object-cover"
                  sizes="(max-width: 768px) 33vw, 200px"
                />
              </div>
            ))}
          </div>
        ) : null}

        {post.comments.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-orange-100/70 bg-white/75 p-2.5">
            {visibleComments.map((comment) => {
              const canDeleteComment = comment.userId === currentUserId;
              const deletingThisComment = deletingCommentIds.includes(comment.id);

              return (
                <div
                  key={comment.id}
                  className="rounded-md border border-orange-50/70 bg-orange-50/35 px-2.5 py-2"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-orange-900">
                        {comment.user.nickname}
                      </p>
                      <p className="text-[11px] text-slate-500">{formatPostTime(comment.createdAt)}</p>
                    </div>

                    {canDeleteComment ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-slate-400 hover:bg-red-50 hover:text-red-600"
                        onClick={() => onDeleteComment?.(comment.id)}
                        disabled={deletingThisComment || isDeleting}
                        aria-label="删除评论"
                      >
                        {deletingThisComment ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </Button>
                    ) : null}
                  </div>

                  <p className="text-sm leading-relaxed text-slate-700">{comment.content}</p>
                </div>
              );
            })}

            {post.comments.length > 2 ? (
              <button
                type="button"
                className="text-xs text-orange-700 hover:text-orange-800"
                onClick={() => setShowAllComments((prev) => !prev)}
              >
                {showAllComments ? '收起评论' : `查看全部 ${post.comments.length} 条评论`}
              </button>
            ) : null}
          </div>
        ) : null}

        {commentBoxOpen ? (
          <div className="space-y-2 rounded-lg border border-orange-100/80 bg-white/85 p-2.5">
            <div className="flex items-center gap-2">
              <Input
                value={commentInput}
                onChange={(e) => {
                  setCommentInput(e.target.value);
                  if (commentError) {
                    setCommentError(null);
                  }
                }}
                placeholder="写下你的评论..."
                maxLength={500}
                disabled={isCommentSubmitting}
                aria-label="评论输入框"
              />
              <Button
                size="sm"
                className="bg-orange-500 text-white hover:bg-orange-600"
                onClick={handleCommentSubmit}
                disabled={isCommentSubmitting || !commentInput.trim()}
              >
                {isCommentSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>

            {commentError ? (
              <p className="text-xs text-destructive" role="alert">
                {commentError}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center gap-2 border-t border-orange-100/70 pt-2">
          <Button
            variant="ghost"
            size="sm"
            className={`gap-1.5 ${
              post.isLiked
                ? 'text-red-500 hover:bg-red-50 hover:!text-red-500 active:!text-red-500'
                : 'text-slate-500 hover:bg-red-50 hover:text-red-500'
            }`}
            onClick={() => onLike?.(post.id)}
            disabled={isLiking || isDeleting}
            aria-busy={isLiking}
          >
            <Heart className={`h-4 w-4 ${post.isLiked ? 'fill-red-500 text-red-500' : ''}`} />
            {isLiking ? <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" /> : null}
            <span className="text-xs">{post.likes > 0 ? post.likes : '点赞'}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-slate-500"
            onClick={() => setCommentBoxOpen((prev) => !prev)}
            disabled={isDeleting}
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

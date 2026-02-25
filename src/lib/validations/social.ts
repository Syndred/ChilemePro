import { z } from 'zod';

// Requirements 14.4: max 9 images
// Requirements 14.5: max 500 characters

export const postStatusSchema = z.enum(['published', 'reviewing', 'rejected']);

export const createPostSchema = z.object({
  content: z.string().max(500, '动态内容最多500字'),
  images: z
    .array(z.string().url('图片必须是有效的URL'))
    .max(9, '最多上传9张照片'),
  mealRecordId: z.string().uuid().optional(),
});

export const commentSchema = z.object({
  postId: z.string().uuid(),
  content: z.string().min(1, '评论不能为空').max(500, '评论最多500字'),
});

export const reportPostSchema = z.object({
  postId: z.string().uuid(),
  reason: z.string().min(1, '举报原因不能为空').max(500),
});

export type CreatePostFormValues = z.infer<typeof createPostSchema>;
export type CommentFormValues = z.infer<typeof commentSchema>;

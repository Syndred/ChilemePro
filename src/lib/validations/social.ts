import { z } from 'zod';

export const postStatusSchema = z.enum(['published', 'reviewing', 'rejected']);

const dataUrlImageRegex = /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/;
const imageInputSchema = z.string().refine(
  (value) => {
    if (value.startsWith('data:image/')) {
      return dataUrlImageRegex.test(value);
    }
    return z.string().url().safeParse(value).success;
  },
  {
    message: '图片必须是有效 URL 或 base64 data URL',
  },
);

export const createPostSchema = z.object({
  content: z.string().max(500, '动态内容最多 500 字'),
  images: z.array(imageInputSchema).max(4, '最多上传 4 张照片'),
  mealRecordId: z.string().uuid().optional(),
});

export const commentSchema = z.object({
  postId: z.string().uuid(),
  content: z.string().min(1, '评论不能为空').max(500, '评论最多 500 字'),
});

export const reportPostSchema = z.object({
  postId: z.string().uuid(),
  reason: z.string().min(1, '举报原因不能为空').max(500),
});

export type CreatePostFormValues = z.infer<typeof createPostSchema>;
export type CommentFormValues = z.infer<typeof commentSchema>;

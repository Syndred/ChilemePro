import { describe, it, expect } from 'vitest';
import { createPostSchema } from './social';

describe('createPostSchema', () => {
  it('accepts valid post', () => {
    const result = createPostSchema.safeParse({
      content: '今天的午餐很健康！',
      images: ['https://example.com/img1.jpg'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects content over 500 characters', () => {
    const result = createPostSchema.safeParse({
      content: 'a'.repeat(501),
      images: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 9 images', () => {
    const images = Array.from({ length: 10 }, (_, i) => `https://example.com/img${i}.jpg`);
    const result = createPostSchema.safeParse({
      content: '测试',
      images,
    });
    expect(result.success).toBe(false);
  });

  it('accepts exactly 9 images', () => {
    const images = Array.from({ length: 9 }, (_, i) => `https://example.com/img${i}.jpg`);
    const result = createPostSchema.safeParse({
      content: '测试',
      images,
    });
    expect(result.success).toBe(true);
  });
});

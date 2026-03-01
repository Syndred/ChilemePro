'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ImagePlus, X, Loader2, Send } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  MAX_POST_CONTENT_LENGTH,
  MAX_POST_IMAGES,
  validatePost,
} from '@/lib/utils/social';

/**
 * CreatePost — form for publishing a new social post.
 * Requirement 14.1: Upload photos and text
 * Requirement 14.4: Max 9 photos
 * Requirement 14.5: Max 500 characters
 */

interface CreatePostProps {
  onSubmit: (data: { content: string; images: string[] }) => Promise<void>;
  isSubmitting?: boolean;
}

export default function CreatePost({ onSubmit, isSubmitting }: CreatePostProps) {
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleContentChange = (value: string) => {
    if (value.length <= MAX_POST_CONTENT_LENGTH) {
      setContent(value);
      setError(null);
    }
  };

  const handleAddImage = () => {
    if (images.length >= MAX_POST_IMAGES) {
      setError(`最多上传${MAX_POST_IMAGES}张照片`);
      return;
    }
    // In a real app, this would open a file picker and upload to Supabase Storage.
    // For now, we use a placeholder URL pattern.
    const placeholderUrl = `https://placeholder.co/400?text=Photo${images.length + 1}`;
    setImages((prev) => [...prev, placeholderUrl]);
    setError(null);
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  };

  const handleSubmit = async () => {
    const validation = validatePost({ content, images });
    if (!validation.valid) {
      setError(validation.errors[0]);
      return;
    }

    try {
      await onSubmit({ content, images });
      setContent('');
      setImages([]);
      setError(null);
    } catch {
      setError('发布失败，请重试');
    }
  };

  const canSubmit = (content.trim().length > 0 || images.length > 0) && !isSubmitting;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <Textarea
          placeholder="分享你的饮食心得..."
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          className="min-h-[80px] resize-none border-0 p-0 focus-visible:ring-0"
          maxLength={MAX_POST_CONTENT_LENGTH}
        />

        {/* Character count */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {content.length}/{MAX_POST_CONTENT_LENGTH}
          </span>
        </div>

        {/* Image preview grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {images.map((img, index) => (
              <div
                key={index}
                className="relative aspect-square overflow-hidden rounded-md bg-muted"
              >
                <Image
                  src={img}
                  alt={`预览 ${index + 1}`}
                  fill
                  unoptimized
                  sizes="(max-width: 768px) 33vw, 160px"
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveImage(index)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white"
                  aria-label={`移除照片 ${index + 1}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Error message */}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Actions */}
        <div className="flex items-center justify-between border-t pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAddImage}
            disabled={images.length >= MAX_POST_IMAGES}
            className="gap-1.5 text-muted-foreground"
          >
            <ImagePlus className="h-4 w-4" />
            <span className="text-xs">
              照片 ({images.length}/{MAX_POST_IMAGES})
            </span>
          </Button>

          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {isSubmitting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-4 w-4" />
            )}
            发布
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

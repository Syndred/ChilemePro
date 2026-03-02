'use client';

import { useRef, useState, type ChangeEvent } from 'react';
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

interface CreatePostProps {
  onSubmit: (
    data: { content: string; images: string[] },
  ) => Promise<{ success: boolean; error?: string }>;
  isSubmitting?: boolean;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

export default function CreatePost({ onSubmit, isSubmitting }: CreatePostProps) {
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleContentChange = (value: string) => {
    if (value.length <= MAX_POST_CONTENT_LENGTH) {
      setContent(value);
      setError(null);
    }
  };

  const handleAddImageClick = () => {
    if (images.length >= MAX_POST_IMAGES) {
      setError(`最多上传 ${MAX_POST_IMAGES} 张照片`);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    const remaining = MAX_POST_IMAGES - images.length;
    const selected = files.slice(0, remaining);

    try {
      const dataUrls = await Promise.all(selected.map((file) => fileToDataUrl(file)));
      setImages((prev) => [...prev, ...dataUrls]);
      setError(null);
    } catch {
      setError('图片读取失败，请重试');
    } finally {
      event.target.value = '';
    }
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
      const result = await onSubmit({ content: content.trim(), images });
      if (!result.success) {
        setError(result.error ?? '发布失败，请重试');
        return;
      }
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
      <CardContent className="space-y-3 p-4">
        <Textarea
          placeholder="分享你的饮食心得..."
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          className="min-h-[80px] resize-none border-0 p-0 focus-visible:ring-0"
          maxLength={MAX_POST_CONTENT_LENGTH}
        />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {content.length}/{MAX_POST_CONTENT_LENGTH}
          </span>
        </div>

        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {images.map((img, index) => (
              <div
                key={`${img.slice(0, 24)}-${index}`}
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

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-between border-t pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAddImageClick}
            disabled={images.length >= MAX_POST_IMAGES}
            className="gap-1.5 text-muted-foreground"
          >
            <ImagePlus className="h-4 w-4" />
            <span className="text-xs">
              照片 ({images.length}/{MAX_POST_IMAGES})
            </span>
          </Button>

          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-4 w-4" />
            )}
            发布
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </CardContent>
    </Card>
  );
}

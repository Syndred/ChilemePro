'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import NextImage from 'next/image';
import { ImagePlus, Loader2, Send, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MAX_POST_CONTENT_LENGTH, MAX_POST_IMAGES, validatePost } from '@/lib/utils/social';

interface CreatePostProps {
  onSubmit: (data: { content: string; images: string[] }) => Promise<{ success: boolean; error?: string }>;
  isSubmitting?: boolean;
}

const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_COMPRESSED_IMAGE_BYTES = 450 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 2200 * 1024;
const IMAGE_MAX_EDGE = 1280;

function formatImageSize(sizeInBytes: number): string {
  const mb = sizeInBytes / (1024 * 1024);
  return `${mb.toFixed(1)}MB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('failed_to_read_image'));
    reader.readAsDataURL(file);
  });
}

function estimateDataUrlBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) {
    return dataUrl.length;
  }

  const base64 = dataUrl.slice(commaIndex + 1);
  return Math.ceil((base64.length * 3) / 4);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('failed_to_decode_image'));
    image.src = dataUrl;
  });
}

async function compressImageFile(file: File): Promise<string> {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(originalDataUrl);

  const longestEdge = Math.max(image.width, image.height);
  const scale = longestEdge > IMAGE_MAX_EDGE ? IMAGE_MAX_EDGE / longestEdge : 1;
  const targetWidth = Math.max(1, Math.round(image.width * scale));
  const targetHeight = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('failed_to_create_canvas_context');
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  let quality = 0.82;
  let compressed = canvas.toDataURL('image/webp', quality);

  while (estimateDataUrlBytes(compressed) > MAX_COMPRESSED_IMAGE_BYTES && quality > 0.45) {
    quality = Math.round((quality - 0.08) * 100) / 100;
    compressed = canvas.toDataURL('image/webp', quality);
  }

  if (estimateDataUrlBytes(compressed) > MAX_COMPRESSED_IMAGE_BYTES) {
    compressed = canvas.toDataURL('image/jpeg', 0.62);
  }

  return compressed;
}

export default function CreatePost({ onSubmit, isSubmitting = false }: CreatePostProps) {
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isReadingImages, setIsReadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleContentChange = (value: string) => {
    if (value.length <= MAX_POST_CONTENT_LENGTH) {
      setContent(value);
      setError(null);
    }
  };

  const handleAddImageClick = () => {
    if (images.length >= MAX_POST_IMAGES) {
      setError(`最多上传 ${MAX_POST_IMAGES} 张图片`);
      return;
    }

    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (files.length === 0) {
      return;
    }

    const remaining = MAX_POST_IMAGES - images.length;
    if (remaining <= 0) {
      setError(`最多上传 ${MAX_POST_IMAGES} 张图片`);
      return;
    }

    const selectedFiles = files.slice(0, remaining);
    const nextImages: string[] = [];
    const existingBytes = images.reduce((sum, image) => sum + estimateDataUrlBytes(image), 0);
    let queuedBytes = 0;
    let localError: string | null = null;

    setIsReadingImages(true);
    try {
      for (const file of selectedFiles) {
        if (!file.type.startsWith('image/')) {
          localError = '仅支持 JPG、PNG、WebP 图片';
          continue;
        }

        if (file.size > MAX_IMAGE_SIZE_BYTES) {
          localError = `图片过大（${formatImageSize(file.size)}），单张请控制在 ${formatImageSize(MAX_IMAGE_SIZE_BYTES)} 内`;
          continue;
        }

        try {
          const dataUrl = await compressImageFile(file);
          if (!dataUrl.startsWith('data:image/')) {
            localError = '图片解析失败，请重新选择';
            continue;
          }

          const imageBytes = estimateDataUrlBytes(dataUrl);
          if (existingBytes + queuedBytes + imageBytes > MAX_TOTAL_IMAGE_BYTES) {
            localError = `压缩后图片总大小仍过大，请控制在 ${formatImageSize(MAX_TOTAL_IMAGE_BYTES)} 内`;
            continue;
          }

          queuedBytes += imageBytes;
          nextImages.push(dataUrl);
        } catch {
          localError = '图片处理失败，请稍后重试';
        }
      }

      if (nextImages.length > 0) {
        setImages((prev) => [...prev, ...nextImages].slice(0, MAX_POST_IMAGES));
      }

      if (files.length > remaining) {
        setError(`最多上传 ${MAX_POST_IMAGES} 张图片，已自动忽略多余选择`);
        return;
      }

      setError(localError);
    } finally {
      setIsReadingImages(false);
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
        setError(result.error ?? '发布动态失败，请重试');
        return;
      }

      setContent('');
      setImages([]);
      setError(null);
    } catch {
      setError('发布动态失败，请重试');
    }
  };

  const canSubmit = (content.trim().length > 0 || images.length > 0) && !isSubmitting;

  return (
    <Card className="overflow-hidden border-orange-200/70 bg-gradient-to-br from-white via-orange-50/45 to-amber-50/65 shadow-[0_16px_35px_-20px_rgba(194,106,21,0.5)]">
      <CardContent className="space-y-3 p-4">
        <div className="rounded-2xl bg-gradient-to-r from-amber-300/80 via-orange-300/85 to-yellow-300/80 p-[1.5px] shadow-[0_10px_24px_-18px_rgba(194,106,21,0.7)]">
          <Textarea
            placeholder="分享这一餐的感受、做法或心得..."
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            className="min-h-[96px] resize-none rounded-[15px] border-0 bg-white/95 px-4 py-3 text-sm leading-relaxed focus-visible:ring-0"
            maxLength={MAX_POST_CONTENT_LENGTH}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {content.length} / {MAX_POST_CONTENT_LENGTH}
          </span>
          <span>
            图片 {images.length} / {MAX_POST_IMAGES}
          </span>
        </div>

        <p className="text-[11px] text-slate-400">
          手机端部分系统可能一次只能选 1 张，可重复点击“添加图片”继续追加。
        </p>

        <div className="grid grid-cols-2 gap-2">
          {images.map((img, index) => (
            <div
              key={`${img.slice(0, 24)}-${index}`}
              className="relative aspect-square overflow-hidden rounded-lg bg-slate-100"
            >
              <NextImage
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
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/65"
                aria-label={`移除图片 ${index + 1}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          {images.length < MAX_POST_IMAGES ? (
            <button
              type="button"
              onClick={handleAddImageClick}
              disabled={isReadingImages || isSubmitting}
              className={`rounded-lg border border-dashed border-orange-300 bg-white/85 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-70 ${
                images.length === 0 ? 'col-span-2 flex h-24 items-center justify-center' : 'aspect-square'
              }`}
              aria-label="添加图片"
              aria-busy={isReadingImages}
            >
              <span className="flex flex-col items-center gap-1 text-orange-700">
                {isReadingImages ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ImagePlus className="h-5 w-5" />
                )}
                <span className="text-xs font-medium">{isReadingImages ? '处理中...' : '添加图片'}</span>
              </span>
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end border-t border-orange-100/70 pt-3">
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit || isReadingImages}
            className="bg-orange-500 text-white hover:bg-orange-600"
          >
            {isSubmitting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-4 w-4" />
            )}
            发布动态
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
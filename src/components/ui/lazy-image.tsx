"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getImageLoadingFlags, type ImageLoadingState } from "@/lib/utils/animation";

interface LazyImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  placeholderClassName?: string;
}

/**
 * Image component with lazy loading, fade-in animation, and loading/error states.
 * 需求: 20.4 - 优化图片加载，使用懒加载和压缩
 * 需求: 20.5 - 在网络慢速时显示加载状态
 */
export function LazyImage({
  src,
  alt,
  width,
  height,
  className = "",
  placeholderClassName = "",
}: LazyImageProps) {
  const [loadState, setLoadState] = useState<ImageLoadingState>("idle");
  const flags = getImageLoadingFlags(loadState);

  const handleLoad = useCallback(() => {
    setLoadState("loaded");
  }, []);

  const handleError = useCallback(() => {
    setLoadState("error");
  }, []);

  const handleLoadStart = useCallback(() => {
    setLoadState("loading");
  }, []);

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ width, height }}>
      <AnimatePresence mode="wait">
        {flags.shouldShowPlaceholder && (
          <motion.div
            key="placeholder"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`absolute inset-0 flex items-center justify-center bg-muted ${placeholderClassName}`}
            aria-hidden="true"
          >
            {flags.shouldShowSpinner && (
              <div
                className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
                role="status"
                aria-label="加载中"
              />
            )}
          </motion.div>
        )}

        {flags.shouldShowError && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground text-sm"
            role="alert"
          >
            加载失败
          </motion.div>
        )}
      </AnimatePresence>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        onLoadStart={handleLoadStart}
        onLoad={handleLoad}
        onError={handleError}
        className={`h-full w-full object-cover transition-opacity duration-300 ${
          flags.shouldShowImage ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

"use client";

import { useCallback } from "react";
import { useDrag } from "@use-gesture/react";
import { calculateSwipeResult, type SwipeResult } from "@/lib/utils/animation";

interface SwipeHandlerProps {
  children: React.ReactNode;
  onSwipe?: (result: SwipeResult) => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  className?: string;
  enabled?: boolean;
}

/**
 * Wraps children with swipe gesture detection using @use-gesture/react.
 * 需求: 20.2 - 在 500 毫秒内响应用户交互
 * 需求: 17.5 - 适配移动端手势操作
 */
export function SwipeHandler({
  children,
  onSwipe,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  className,
  enabled = true,
}: SwipeHandlerProps) {
  const handleSwipeEnd = useCallback(
    (deltaX: number, deltaY: number, velocityX: number, velocityY: number) => {
      const result = calculateSwipeResult(deltaX, deltaY, velocityX, velocityY);

      if (onSwipe) {
        onSwipe(result);
      }

      if (!result.shouldNavigate) return;

      switch (result.direction) {
        case "left":
          onSwipeLeft?.();
          break;
        case "right":
          onSwipeRight?.();
          break;
        case "up":
          onSwipeUp?.();
          break;
        case "down":
          onSwipeDown?.();
          break;
      }
    },
    [onSwipe, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown],
  );

  const bind = useDrag(
    ({ last, movement: [mx, my], velocity: [vx, vy], direction: [dx, dy] }) => {
      if (!last) return;
      // velocity from use-gesture is always positive; apply direction sign
      handleSwipeEnd(mx, my, vx * dx, vy * dy);
    },
    {
      enabled,
      filterTaps: true,
      axis: undefined, // allow both axes
    },
  );

  return (
    <div {...bind()} className={className} style={{ touchAction: "pan-y" }}>
      {children}
    </div>
  );
}

"use client";

import { motion, type Variants, type Transition } from "framer-motion";
import {
  slideUpVariants,
  fadeVariants,
  slideRightVariants,
  SPRING_TRANSITION,
  FADE_TRANSITION,
} from "@/lib/utils/animation";

export type TransitionPreset = "slide-up" | "fade" | "slide-right";

const presetMap: Record<TransitionPreset, { variants: Variants; transition: Transition }> = {
  "slide-up": { variants: slideUpVariants, transition: SPRING_TRANSITION },
  fade: { variants: fadeVariants, transition: FADE_TRANSITION },
  "slide-right": { variants: slideRightVariants, transition: SPRING_TRANSITION },
};

interface PageTransitionProps {
  children: React.ReactNode;
  preset?: TransitionPreset;
  className?: string;
}

/**
 * Wraps page content with framer-motion enter/exit animations.
 * 需求: 20.3 - 使用动画过渡提升用户体验
 */
export function PageTransition({
  children,
  preset = "slide-up",
  className,
}: PageTransitionProps) {
  const { variants, transition } = presetMap[preset];

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={transition}
      className={className}
    >
      {children}
    </motion.div>
  );
}

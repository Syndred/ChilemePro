/**
 * Animation configuration constants and helper functions
 * Pure utility functions for page transitions, gesture handling, and image loading states
 *
 * 需求: 20.2, 20.3, 20.4, 20.5
 */

import type { Transition, Variants } from 'framer-motion';

// ============================================================
// Page Transition Presets
// ============================================================

/** Standard spring transition for page transitions */
export const SPRING_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
  mass: 1,
};

/** Quick transition for micro-interactions */
export const QUICK_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 35,
  mass: 0.8,
};

/** Smooth ease transition for fades */
export const FADE_TRANSITION: Transition = {
  duration: 0.25,
  ease: [0.25, 0.1, 0.25, 1],
};

/** Slide-up page entrance variants */
export const slideUpVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

/** Fade-in page entrance variants */
export const fadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/** Slide-from-right variants (for forward navigation) */
export const slideRightVariants: Variants = {
  initial: { opacity: 0, x: 30 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
};

// ============================================================
// Gesture Thresholds & Configuration
// ============================================================

/** Minimum swipe distance (px) to trigger navigation */
export const SWIPE_THRESHOLD = 50;

/** Minimum swipe velocity (px/s) to trigger navigation */
export const SWIPE_VELOCITY_THRESHOLD = 300;

/** Maximum vertical deviation (px) allowed during horizontal swipe */
export const SWIPE_MAX_VERTICAL_DEVIATION = 75;

export interface SwipeResult {
  direction: 'left' | 'right' | 'up' | 'down' | 'none';
  shouldNavigate: boolean;
}

/**
 * Determines swipe direction and whether it should trigger navigation.
 *
 * @param deltaX - Horizontal displacement (positive = right)
 * @param deltaY - Vertical displacement (positive = down)
 * @param velocityX - Horizontal velocity (positive = right)
 * @param velocityY - Vertical velocity (positive = down)
 * @returns SwipeResult with direction and navigation intent
 */
export function calculateSwipeResult(
  deltaX: number,
  deltaY: number,
  velocityX: number,
  velocityY: number,
): SwipeResult {
  const absDx = Math.abs(deltaX);
  const absDy = Math.abs(deltaY);
  const absVx = Math.abs(velocityX);
  const absVy = Math.abs(velocityY);

  // Determine if the gesture is primarily horizontal or vertical
  const isHorizontal = absDx > absDy;

  if (isHorizontal) {
    // Check vertical deviation constraint for horizontal swipes
    if (absDy > SWIPE_MAX_VERTICAL_DEVIATION) {
      return { direction: 'none', shouldNavigate: false };
    }

    const direction = deltaX > 0 ? 'right' : 'left';
    const shouldNavigate =
      absDx >= SWIPE_THRESHOLD || absVx >= SWIPE_VELOCITY_THRESHOLD;

    return { direction, shouldNavigate };
  }

  // Vertical swipe
  const direction = deltaY > 0 ? 'down' : 'up';
  const shouldNavigate =
    absDy >= SWIPE_THRESHOLD || absVy >= SWIPE_VELOCITY_THRESHOLD;

  return { direction, shouldNavigate };
}

// ============================================================
// Image Loading State Management
// ============================================================

export type ImageLoadingState = 'idle' | 'loading' | 'loaded' | 'error';

export interface ImageLoadingResult {
  state: ImageLoadingState;
  shouldShowPlaceholder: boolean;
  shouldShowSpinner: boolean;
  shouldShowError: boolean;
  shouldShowImage: boolean;
}

/**
 * Derives UI flags from an image loading state.
 */
export function getImageLoadingFlags(state: ImageLoadingState): ImageLoadingResult {
  return {
    state,
    shouldShowPlaceholder: state === 'idle' || state === 'loading',
    shouldShowSpinner: state === 'loading',
    shouldShowError: state === 'error',
    shouldShowImage: state === 'loaded',
  };
}

// ============================================================
// Network / Slow Connection Detection
// ============================================================

export type NetworkSpeed = 'fast' | 'slow' | 'offline' | 'unknown';

export interface NetworkSpeedInput {
  online: boolean;
  effectiveType?: string; // '4g' | '3g' | '2g' | 'slow-2g'
  downlink?: number; // Mbps
  rtt?: number; // ms
}

/**
 * Classifies network speed from NetworkInformation API data.
 * Returns 'slow' when connection is 2g/slow-2g, downlink < 1 Mbps, or RTT > 500ms.
 */
export function classifyNetworkSpeed(input: NetworkSpeedInput): NetworkSpeed {
  if (!input.online) {
    return 'offline';
  }

  const effectiveType = input.effectiveType;
  if (effectiveType === 'slow-2g' || effectiveType === '2g') {
    return 'slow';
  }

  if (input.downlink !== undefined && input.downlink < 1) {
    return 'slow';
  }

  if (input.rtt !== undefined && input.rtt > 500) {
    return 'slow';
  }

  if (effectiveType === '4g' || effectiveType === '3g') {
    return 'fast';
  }

  if (input.downlink !== undefined || input.rtt !== undefined) {
    return 'fast';
  }

  return 'unknown';
}

/**
 * Returns whether a loading skeleton/spinner should be shown based on network speed.
 */
export function shouldShowLoadingState(speed: NetworkSpeed): boolean {
  return speed === 'slow' || speed === 'offline';
}

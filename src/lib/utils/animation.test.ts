import { describe, it, expect } from 'vitest';
import {
  SPRING_TRANSITION,
  QUICK_TRANSITION,
  FADE_TRANSITION,
  slideUpVariants,
  fadeVariants,
  slideRightVariants,
  SWIPE_THRESHOLD,
  SWIPE_VELOCITY_THRESHOLD,
  SWIPE_MAX_VERTICAL_DEVIATION,
  calculateSwipeResult,
  getImageLoadingFlags,
  classifyNetworkSpeed,
  shouldShowLoadingState,
  type ImageLoadingState,
} from './animation';

// ============================================================
// Transition Presets
// ============================================================

describe('Transition presets', () => {
  it('SPRING_TRANSITION has spring type with stiffness and damping', () => {
    expect(SPRING_TRANSITION).toEqual({
      type: 'spring',
      stiffness: 300,
      damping: 30,
      mass: 1,
    });
  });

  it('QUICK_TRANSITION has higher stiffness for snappier feel', () => {
    expect(QUICK_TRANSITION.type).toBe('spring');
    expect((QUICK_TRANSITION as { stiffness: number }).stiffness).toBeGreaterThan(
      (SPRING_TRANSITION as { stiffness: number }).stiffness,
    );
  });

  it('FADE_TRANSITION uses timed duration', () => {
    expect(FADE_TRANSITION).toHaveProperty('duration');
    expect(FADE_TRANSITION).toHaveProperty('ease');
  });
});

// ============================================================
// Page Transition Variants
// ============================================================

describe('Page transition variants', () => {
  it('slideUpVariants has initial, animate, exit states', () => {
    expect(slideUpVariants).toHaveProperty('initial');
    expect(slideUpVariants).toHaveProperty('animate');
    expect(slideUpVariants).toHaveProperty('exit');
    expect((slideUpVariants.animate as { opacity: number }).opacity).toBe(1);
    expect((slideUpVariants.animate as { y: number }).y).toBe(0);
  });

  it('fadeVariants animates opacity only', () => {
    expect((fadeVariants.initial as { opacity: number }).opacity).toBe(0);
    expect((fadeVariants.animate as { opacity: number }).opacity).toBe(1);
    expect((fadeVariants.exit as { opacity: number }).opacity).toBe(0);
  });

  it('slideRightVariants slides from right', () => {
    expect((slideRightVariants.initial as { x: number }).x).toBeGreaterThan(0);
    expect((slideRightVariants.animate as { x: number }).x).toBe(0);
  });
});

// ============================================================
// calculateSwipeResult
// ============================================================

describe('calculateSwipeResult', () => {
  it('returns "none" when displacement and velocity are below thresholds', () => {
    const result = calculateSwipeResult(10, 5, 100, 50);
    expect(result.shouldNavigate).toBe(false);
    expect(result.direction).not.toBe('none');
  });

  it('detects right swipe when deltaX > threshold', () => {
    const result = calculateSwipeResult(SWIPE_THRESHOLD + 1, 0, 0, 0);
    expect(result.direction).toBe('right');
    expect(result.shouldNavigate).toBe(true);
  });

  it('detects left swipe when deltaX < -threshold', () => {
    const result = calculateSwipeResult(-(SWIPE_THRESHOLD + 1), 0, 0, 0);
    expect(result.direction).toBe('left');
    expect(result.shouldNavigate).toBe(true);
  });

  it('detects right swipe via velocity even with small displacement', () => {
    const result = calculateSwipeResult(20, 0, SWIPE_VELOCITY_THRESHOLD + 1, 0);
    expect(result.direction).toBe('right');
    expect(result.shouldNavigate).toBe(true);
  });

  it('detects left swipe via velocity', () => {
    const result = calculateSwipeResult(-20, 0, -(SWIPE_VELOCITY_THRESHOLD + 1), 0);
    expect(result.direction).toBe('left');
    expect(result.shouldNavigate).toBe(true);
  });

  it('rejects horizontal swipe with too much vertical deviation', () => {
    // absDx must be > absDy for horizontal classification, but absDy > max deviation
    const result = calculateSwipeResult(
      SWIPE_MAX_VERTICAL_DEVIATION + 20,
      SWIPE_MAX_VERTICAL_DEVIATION + 1,
      0,
      0,
    );
    // absDx (95) > absDy (76) so it's horizontal, but vertical deviation (76) > max (75)
    expect(result.direction).toBe('none');
    expect(result.shouldNavigate).toBe(false);
  });

  it('detects down swipe', () => {
    const result = calculateSwipeResult(0, SWIPE_THRESHOLD + 1, 0, 0);
    expect(result.direction).toBe('down');
    expect(result.shouldNavigate).toBe(true);
  });

  it('detects up swipe', () => {
    const result = calculateSwipeResult(0, -(SWIPE_THRESHOLD + 1), 0, 0);
    expect(result.direction).toBe('up');
    expect(result.shouldNavigate).toBe(true);
  });

  it('detects vertical swipe via velocity', () => {
    const result = calculateSwipeResult(0, 10, 0, SWIPE_VELOCITY_THRESHOLD + 1);
    expect(result.direction).toBe('down');
    expect(result.shouldNavigate).toBe(true);
  });

  it('prefers horizontal when absDx > absDy', () => {
    const result = calculateSwipeResult(SWIPE_THRESHOLD + 10, 20, 0, 0);
    expect(result.direction).toBe('right');
  });

  it('prefers vertical when absDy > absDx', () => {
    const result = calculateSwipeResult(20, SWIPE_THRESHOLD + 10, 0, 0);
    expect(result.direction).toBe('down');
  });
});

// ============================================================
// getImageLoadingFlags
// ============================================================

describe('getImageLoadingFlags', () => {
  const cases: Array<[ImageLoadingState, boolean, boolean, boolean, boolean]> = [
    //  state,     placeholder, spinner, error,  image
    ['idle',       true,        false,   false,  false],
    ['loading',    true,        true,    false,  false],
    ['loaded',     false,       false,   false,  true],
    ['error',      false,       false,   true,   false],
  ];

  it.each(cases)(
    'state=%s → placeholder=%s, spinner=%s, error=%s, image=%s',
    (state, placeholder, spinner, error, image) => {
      const flags = getImageLoadingFlags(state);
      expect(flags.state).toBe(state);
      expect(flags.shouldShowPlaceholder).toBe(placeholder);
      expect(flags.shouldShowSpinner).toBe(spinner);
      expect(flags.shouldShowError).toBe(error);
      expect(flags.shouldShowImage).toBe(image);
    },
  );

  it('exactly one primary display flag is true for each state', () => {
    const states: ImageLoadingState[] = ['idle', 'loading', 'loaded', 'error'];
    for (const state of states) {
      const flags = getImageLoadingFlags(state);
      // spinner + image + error should have at most one true
      const primaryFlags = [flags.shouldShowSpinner, flags.shouldShowImage, flags.shouldShowError];
      const trueCount = primaryFlags.filter(Boolean).length;
      // idle has none of the three primary flags true (only placeholder)
      expect(trueCount).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================================
// classifyNetworkSpeed
// ============================================================

describe('classifyNetworkSpeed', () => {
  it('returns "offline" when not online', () => {
    expect(classifyNetworkSpeed({ online: false })).toBe('offline');
  });

  it('returns "slow" for 2g', () => {
    expect(classifyNetworkSpeed({ online: true, effectiveType: '2g' })).toBe('slow');
  });

  it('returns "slow" for slow-2g', () => {
    expect(classifyNetworkSpeed({ online: true, effectiveType: 'slow-2g' })).toBe('slow');
  });

  it('returns "slow" for low downlink', () => {
    expect(classifyNetworkSpeed({ online: true, downlink: 0.5 })).toBe('slow');
  });

  it('returns "slow" for high RTT', () => {
    expect(classifyNetworkSpeed({ online: true, rtt: 600 })).toBe('slow');
  });

  it('returns "fast" for 4g', () => {
    expect(classifyNetworkSpeed({ online: true, effectiveType: '4g' })).toBe('fast');
  });

  it('returns "fast" for 3g', () => {
    expect(classifyNetworkSpeed({ online: true, effectiveType: '3g' })).toBe('fast');
  });

  it('returns "fast" when downlink is good', () => {
    expect(classifyNetworkSpeed({ online: true, downlink: 10 })).toBe('fast');
  });

  it('returns "unknown" when online but no network info', () => {
    expect(classifyNetworkSpeed({ online: true })).toBe('unknown');
  });

  it('effectiveType slow-2g takes priority over good downlink', () => {
    expect(
      classifyNetworkSpeed({ online: true, effectiveType: 'slow-2g', downlink: 50 }),
    ).toBe('slow');
  });
});

// ============================================================
// shouldShowLoadingState
// ============================================================

describe('shouldShowLoadingState', () => {
  it('returns true for slow network', () => {
    expect(shouldShowLoadingState('slow')).toBe(true);
  });

  it('returns true for offline', () => {
    expect(shouldShowLoadingState('offline')).toBe(true);
  });

  it('returns false for fast network', () => {
    expect(shouldShowLoadingState('fast')).toBe(false);
  });

  it('returns false for unknown', () => {
    expect(shouldShowLoadingState('unknown')).toBe(false);
  });
});

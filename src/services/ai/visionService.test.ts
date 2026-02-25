import { describe, it, expect, vi } from 'vitest';
import {
  withTimeout,
  AI_RECOGNITION_TIMEOUT_MS,
  recognizeFoodWithTimeout,
} from './visionService';

describe('withTimeout', () => {
  it('returns data when promise resolves before timeout', async () => {
    const result = await withTimeout(
      Promise.resolve('hello'),
      { timeoutMs: 1000 },
    );
    expect(result).toEqual({ timedOut: false, data: 'hello' });
  });

  it('returns timedOut when promise takes longer than timeout', async () => {
    const slowPromise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('too late'), 500);
    });
    const result = await withTimeout(slowPromise, { timeoutMs: 50 });
    expect(result).toEqual({ timedOut: true });
  });

  it('handles promise rejection gracefully', async () => {
    const failingPromise = Promise.reject(new Error('fail'));
    await expect(
      withTimeout(failingPromise, { timeoutMs: 1000 }),
    ).rejects.toThrow('fail');
  });

  it('clears timeout after promise resolves', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    await withTimeout(Promise.resolve(42), { timeoutMs: 5000 });
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('returns correct data type for various values', async () => {
    const numResult = await withTimeout(Promise.resolve(42), { timeoutMs: 100 });
    expect(numResult).toEqual({ timedOut: false, data: 42 });

    const objResult = await withTimeout(
      Promise.resolve({ a: 1 }),
      { timeoutMs: 100 },
    );
    expect(objResult).toEqual({ timedOut: false, data: { a: 1 } });

    const nullResult = await withTimeout(Promise.resolve(null), { timeoutMs: 100 });
    expect(nullResult).toEqual({ timedOut: false, data: null });
  });
});

describe('AI_RECOGNITION_TIMEOUT_MS', () => {
  it('is set to 10 seconds per Requirement 4.7', () => {
    expect(AI_RECOGNITION_TIMEOUT_MS).toBe(10_000);
  });
});

describe('recognizeFoodWithTimeout', () => {
  it('returns null when recognition times out', async () => {
    // Set env vars so the service doesn't throw before making the fetch call
    const origGoogleKey = process.env.GOOGLE_VISION_API_KEY;
    const origOpenAIKey = process.env.OPENAI_API_KEY;
    process.env.GOOGLE_VISION_API_KEY = 'test-key';
    process.env.OPENAI_API_KEY = 'test-key';

    // Mock fetch to be slow – simulates a slow API response
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(new Response('{}')), 500)),
    );

    // Use a very short timeout to trigger timeout
    const result = await recognizeFoodWithTimeout('base64data', 10);
    expect(result).toBeNull();

    // Restore
    globalThis.fetch = originalFetch;
    process.env.GOOGLE_VISION_API_KEY = origGoogleKey;
    process.env.OPENAI_API_KEY = origOpenAIKey;
  });
});

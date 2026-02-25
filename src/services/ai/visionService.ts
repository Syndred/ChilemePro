/**
 * AI Vision Service - Food recognition via Google Vision API + GPT-4o
 * Requirements: 4.2, 4.3, 4.5, 4.7
 */

import type { FoodRecognitionResult, RecognizedFood } from '@/types';

// ─── Pure timeout wrapper (testable) ───────────────────────────

export interface WithTimeoutOptions {
  /** Timeout in milliseconds */
  timeoutMs: number;
}

/**
 * Race a promise against a timeout. Returns `{ timedOut: true }` if the
 * timeout fires first, otherwise `{ timedOut: false, data }`.
 *
 * This is a pure async utility – no side-effects beyond the timer.
 * Requirement 4.7: 10-second AI recognition timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  { timeoutMs }: WithTimeoutOptions,
): Promise<{ timedOut: false; data: T } | { timedOut: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });

  try {
    const result = await Promise.race([
      promise.then((data) => ({ timedOut: false as const, data })),
      timeoutPromise,
    ]);
    return result;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ─── AI recognition timeout constant ───────────────────────────

/** Default timeout for AI food recognition (10 seconds per Requirement 4.7) */
export const AI_RECOGNITION_TIMEOUT_MS = 10_000;

// ─── Google Vision API call ────────────────────────────────────

async function callGoogleVisionAPI(base64Image: string): Promise<string[]> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_VISION_API_KEY is not configured');
  }

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64Image },
            features: [
              { type: 'LABEL_DETECTION', maxResults: 10 },
              { type: 'OBJECT_LOCALIZATION', maxResults: 10 },
            ],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Google Vision API error: ${response.status}`);
  }

  const data = await response.json();
  const annotations = data.responses?.[0];
  const labels: string[] = [
    ...(annotations?.labelAnnotations?.map((a: { description: string }) => a.description) ?? []),
    ...(annotations?.localizedObjectAnnotations?.map((a: { name: string }) => a.name) ?? []),
  ];

  return labels;
}

// ─── GPT-4o nutrition analysis ─────────────────────────────────

async function callGPT4oForNutrition(
  labels: string[],
  base64Image: string,
): Promise<RecognizedFood[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const prompt = `You are a food nutrition expert. Based on the image and these detected labels: [${labels.join(', ')}], identify all food items visible in the image.

For each food item, provide:
- name (in Chinese)
- estimated calories (kcal, for a typical serving)
- protein (g)
- fat (g)
- carbs (g)
- confidence (0-1)

Respond ONLY with a JSON array, no markdown, no explanation:
[{"name":"食物名","calories":100,"protein":10,"fat":5,"carbs":20,"confidence":0.85}]`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64Image}` },
            },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim() ?? '[]';

  try {
    const parsed = JSON.parse(content) as RecognizedFood[];
    return parsed;
  } catch {
    return [];
  }
}

// ─── Main recognition pipeline ─────────────────────────────────

/**
 * Core recognition logic – calls Google Vision then GPT-4o.
 * Exported for direct testing; the page uses `recognizeFoodWithTimeout`.
 */
export async function recognizeFood(
  base64Image: string,
): Promise<FoodRecognitionResult> {
  const startTime = Date.now();

  const labels = await callGoogleVisionAPI(base64Image);
  const foods = await callGPT4oForNutrition(labels, base64Image);

  const processingTime = Date.now() - startTime;
  const avgConfidence =
    foods.length > 0
      ? foods.reduce((sum, f) => sum + f.confidence, 0) / foods.length
      : 0;

  return {
    success: foods.length > 0,
    foods,
    confidence: Math.round(avgConfidence * 100) / 100,
    processingTime,
  };
}

/**
 * Recognize food with a 10-second timeout.
 * Requirement 4.5 & 4.7: auto-fallback to manual mode on timeout.
 *
 * Returns `FoodRecognitionResult` on success, or `null` when timed out.
 */
export async function recognizeFoodWithTimeout(
  base64Image: string,
  timeoutMs: number = AI_RECOGNITION_TIMEOUT_MS,
): Promise<FoodRecognitionResult | null> {
  const result = await withTimeout(recognizeFood(base64Image), { timeoutMs });

  if (result.timedOut) {
    return null; // caller should switch to manual mode
  }

  return result.data;
}

/**
 * AI Health Advice Service - GPT-4o powered advice generation.
 * Requirements: 7.1, 7.2, 7.3, 7.4
 *
 * This service handles the external AI call for generating natural language
 * health advice. The core analysis logic lives in nutrition-analysis.ts.
 */

import type { NutritionAnalysis, HealthAdvice } from '@/types';

export interface GenerateAdviceInput {
  analysis: NutritionAnalysis;
  nickname: string;
}

/**
 * Call GPT-4o to generate personalized health advice text.
 * Falls back to the rule-based suggestions from nutrition-analysis.ts on failure.
 */
export async function generateAIHealthAdvice(
  input: GenerateAdviceInput,
): Promise<{
  mealSuggestions: string[];
  exerciseSuggestions: string[];
  nutritionTips: string[];
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Fallback: return the rule-based suggestions already in the analysis
    return {
      mealSuggestions: input.analysis.suggestions,
      exerciseSuggestions: [],
      nutritionTips: [],
    };
  }

  const { analysis, nickname } = input;

  const statusText = analysis.isOverTarget
    ? '超标'
    : analysis.isUnderTarget
      ? '不足'
      : '达标';

  const prompt = `你是一位专业的营养师。请根据以下用户的饮食数据，用简洁友好的中文给出个性化建议。

用户: ${nickname}
今日摄入: ${Math.round(analysis.totalCalories)} 千卡 / 目标: ${Math.round(analysis.targetCalories)} 千卡 (${statusText})
蛋白质占比: ${Math.round(analysis.proteinRatio * 100)}%
脂肪占比: ${Math.round(analysis.fatRatio * 100)}%
碳水占比: ${Math.round(analysis.carbsRatio * 100)}%

请返回 JSON 格式（不要 markdown）：
{"mealSuggestions":["建议1","建议2"],"exerciseSuggestions":["建议1"],"nutritionTips":["提示1"]}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() ?? '';
    const parsed = JSON.parse(content) as {
      mealSuggestions: string[];
      exerciseSuggestions: string[];
      nutritionTips: string[];
    };

    return {
      mealSuggestions: parsed.mealSuggestions ?? [],
      exerciseSuggestions: parsed.exerciseSuggestions ?? [],
      nutritionTips: parsed.nutritionTips ?? [],
    };
  } catch {
    // Fallback to rule-based suggestions
    return {
      mealSuggestions: analysis.suggestions,
      exerciseSuggestions: [],
      nutritionTips: [],
    };
  }
}

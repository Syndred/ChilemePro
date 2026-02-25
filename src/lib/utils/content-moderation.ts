/**
 * Pure content moderation business logic — no side effects, fully testable.
 *
 * Requirement 23.1: Prohibit illegal, vulgar, advertising, traffic-diverting content
 * Requirement 23.2: AI initial review when user publishes a post
 * Requirement 23.3: Reject publication when AI detects violation
 * Requirement 23.4: User reports → manual review queue
 * Requirement 23.5: Confirmed violation → take down post
 * Requirement 23.6: 3 cumulative violations → ban account
 * Requirement 23.7: Log all moderation actions
 * Requirement 23.8: Provide user appeal channel
 */

import type { ModerationDecision } from '@/types';

// --- Constants ---

/** Number of confirmed violations before account ban */
export const VIOLATION_BAN_THRESHOLD = 3;

/** Violation categories for AI detection */
export const VIOLATION_CATEGORIES = [
  'illegal',      // 违法内容
  'vulgar',       // 低俗内容
  'advertising',  // 广告内容
  'diversion',    // 导流内容
  'harassment',   // 骚扰内容
  'spam',         // 垃圾内容
] as const;

export type ViolationCategory = (typeof VIOLATION_CATEGORIES)[number];

// --- Types ---

export interface AIModerationResult {
  isViolation: boolean;
  confidence: number;
  categories: ViolationCategory[];
  reason: string;
}

export interface ModerationReviewInput {
  postId: string;
  decision: ModerationDecision;
  moderatorId: string;
  reason?: string;
}

export interface AppealInput {
  userId: string;
  moderationLogId: string;
  reason: string;
}

export interface AppealValidationResult {
  valid: boolean;
  error?: string;
}

export interface ViolationCountResult {
  shouldBan: boolean;
  violationCount: number;
  reason?: string;
}

export interface ContentCheckResult {
  allowed: boolean;
  reason?: string;
  aiResult?: AIModerationResult;
}

export interface ReportInput {
  postId: string;
  reporterId: string;
  reason: string;
}

export interface ReportValidationResult {
  valid: boolean;
  error?: string;
}

export interface ModerationLogEntry {
  postId: string;
  reporterId?: string;
  reason?: string;
  aiResult?: AIModerationResult;
  decision: ModerationDecision;
}

// --- Pure Functions ---

/**
 * Build the AI moderation prompt for GPT-4o content review.
 * Requirement 23.1, 23.2: AI initial review for prohibited content.
 */
export function buildModerationPrompt(content: string, imageDescriptions: string[] = []): string {
  const imageContext = imageDescriptions.length > 0
    ? `\n图片描述：${imageDescriptions.join('；')}`
    : '';

  return `请审核以下社交动态内容是否包含违规信息。违规类型包括：违法内容、低俗内容、广告内容、导流内容、骚扰内容、垃圾内容。

内容：${content}${imageContext}

请以JSON格式返回审核结果：
{
  "isViolation": boolean,
  "confidence": number (0-1),
  "categories": string[],
  "reason": string
}`;
}

/**
 * Parse the AI moderation response into a structured result.
 * Requirement 23.2: Process AI review results.
 */
export function parseAIModerationResponse(response: string): AIModerationResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        isViolation: false,
        confidence: 0,
        categories: [],
        reason: 'AI 审核结果解析失败，默认通过',
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const isViolation = Boolean(parsed.isViolation);
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;

    const categories: ViolationCategory[] = Array.isArray(parsed.categories)
      ? parsed.categories.filter((c: string) =>
          (VIOLATION_CATEGORIES as readonly string[]).includes(c),
        )
      : [];

    const reason = typeof parsed.reason === 'string' ? parsed.reason : '';

    return { isViolation, confidence, categories, reason };
  } catch {
    return {
      isViolation: false,
      confidence: 0,
      categories: [],
      reason: 'AI 审核结果解析失败，默认通过',
    };
  }
}

/**
 * Determine if content should be blocked based on AI moderation result.
 * Requirement 23.3: Reject publication when AI detects violation.
 */
export function shouldBlockContent(aiResult: AIModerationResult): ContentCheckResult {
  if (aiResult.isViolation && aiResult.confidence >= 0.7) {
    return {
      allowed: false,
      reason: aiResult.reason || '内容包含违规信息，发布被拒绝',
      aiResult,
    };
  }

  return { allowed: true, aiResult };
}

/**
 * Validate a user report submission.
 * Requirement 23.4: User reports → manual review queue.
 */
export function validateReport(input: ReportInput): ReportValidationResult {
  if (!input.postId || input.postId.trim().length === 0) {
    return { valid: false, error: '动态 ID 不能为空' };
  }

  if (!input.reporterId || input.reporterId.trim().length === 0) {
    return { valid: false, error: '举报人 ID 不能为空' };
  }

  const trimmedReason = input.reason?.trim() ?? '';
  if (trimmedReason.length === 0) {
    return { valid: false, error: '举报原因不能为空' };
  }

  if (trimmedReason.length > 500) {
    return { valid: false, error: '举报原因最多500字' };
  }

  return { valid: true };
}

/**
 * Check if a user should be banned based on cumulative violation count.
 * Requirement 23.6: 3 cumulative violations → ban account.
 */
export function checkViolationBan(confirmedViolationCount: number): ViolationCountResult {
  if (confirmedViolationCount >= VIOLATION_BAN_THRESHOLD) {
    return {
      shouldBan: true,
      violationCount: confirmedViolationCount,
      reason: `累计 ${confirmedViolationCount} 次违规，账号将被封禁`,
    };
  }

  return {
    shouldBan: false,
    violationCount: confirmedViolationCount,
  };
}

/**
 * Validate an appeal submission.
 * Requirement 23.8: Provide user appeal channel.
 */
export function validateAppeal(input: AppealInput): AppealValidationResult {
  if (!input.userId || input.userId.trim().length === 0) {
    return { valid: false, error: '用户 ID 不能为空' };
  }

  if (!input.moderationLogId || input.moderationLogId.trim().length === 0) {
    return { valid: false, error: '审核记录 ID 不能为空' };
  }

  const trimmedReason = input.reason?.trim() ?? '';
  if (trimmedReason.length === 0) {
    return { valid: false, error: '申诉原因不能为空' };
  }

  if (trimmedReason.length > 1000) {
    return { valid: false, error: '申诉原因最多1000字' };
  }

  return { valid: true };
}

/**
 * Build a moderation log entry for recording.
 * Requirement 23.7: Log all moderation actions.
 */
export function buildModerationLogEntry(
  postId: string,
  decision: ModerationDecision,
  options?: {
    reporterId?: string;
    reason?: string;
    aiResult?: AIModerationResult;
  },
): ModerationLogEntry {
  return {
    postId,
    reporterId: options?.reporterId,
    reason: options?.reason,
    aiResult: options?.aiResult,
    decision,
  };
}

/**
 * Determine the moderation decision based on AI result.
 * Requirement 23.2, 23.3: AI review → approve or reject.
 */
export function determineAIDecision(aiResult: AIModerationResult): ModerationDecision {
  if (aiResult.isViolation && aiResult.confidence >= 0.7) {
    return 'rejected';
  }
  if (aiResult.isViolation && aiResult.confidence >= 0.4) {
    return 'pending'; // Needs manual review
  }
  return 'approved';
}

/**
 * Get a human-readable label for a violation category.
 */
export function getViolationCategoryLabel(category: ViolationCategory): string {
  const labels: Record<ViolationCategory, string> = {
    illegal: '违法内容',
    vulgar: '低俗内容',
    advertising: '广告内容',
    diversion: '导流内容',
    harassment: '骚扰内容',
    spam: '垃圾内容',
  };
  return labels[category] ?? '未知违规';
}

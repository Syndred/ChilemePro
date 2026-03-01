'use server';

import { createClient } from '@/lib/supabase/server';
import {
  buildModerationPrompt,
  parseAIModerationResponse,
  shouldBlockContent,
  validateReport,
  checkViolationBan,
  validateAppeal,
  buildModerationLogEntry,
  determineAIDecision,
  type AIModerationResult,
} from '@/lib/utils/content-moderation';
import type { ModerationDecision } from '@/types';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Perform AI content moderation on post content before publishing.
 * Requirement 23.1, 23.2, 23.3: AI initial review, reject violations.
 */
export async function moderateContent(
  content: string,
  images: string[] = [],
): Promise<ActionResult<{ allowed: boolean; aiResult: AIModerationResult }>> {
  try {
    const prompt = buildModerationPrompt(content, images);

    // Call GPT-4o for content moderation
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // If no API key, allow content (graceful degradation)
      return {
        success: true,
        data: {
          allowed: true,
          aiResult: {
            isViolation: false,
            confidence: 0,
            categories: [],
            reason: 'AI 审核服务未配置，默认通过',
          },
        },
      };
    }

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
            role: 'system',
            content: '你是一个内容审核助手，负责检测社交平台上的违规内容。请严格按照JSON格式返回结果。',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      // Graceful degradation: allow content if AI service fails
      return {
        success: true,
        data: {
          allowed: true,
          aiResult: {
            isViolation: false,
            confidence: 0,
            categories: [],
            reason: 'AI 审核服务暂时不可用，默认通过',
          },
        },
      };
    }

    const data = await response.json();
    const aiResponseText = data.choices?.[0]?.message?.content ?? '';
    const aiResult = parseAIModerationResponse(aiResponseText);
    const checkResult = shouldBlockContent(aiResult);

    return {
      success: true,
      data: { allowed: checkResult.allowed, aiResult },
    };
  } catch {
    // Graceful degradation
    return {
      success: true,
      data: {
        allowed: true,
        aiResult: {
          isViolation: false,
          confidence: 0,
          categories: [],
          reason: 'AI 审核服务异常，默认通过',
        },
      },
    };
  }
}

/**
 * Log AI moderation result for a post.
 * Requirement 23.7: Log all moderation actions.
 */
export async function logModerationResult(
  postId: string,
  aiResult: AIModerationResult,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const decision = determineAIDecision(aiResult);
    const logEntry = buildModerationLogEntry(postId, decision, { aiResult });

    const { error } = await supabase.from('content_moderation_logs').insert({
      post_id: logEntry.postId,
      reporter_id: null,
      reason: logEntry.reason ?? aiResult.reason,
      ai_result: aiResult as unknown as Record<string, unknown>,
      decision: logEntry.decision,
    });

    if (error) {
      return { success: false, error: '记录审核结果失败' };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误' };
  }
}

/**
 * Report a post and add it to the manual review queue.
 * Requirement 23.4: User reports → manual review queue.
 */
export async function reportPostForModeration(
  postId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const validation = validateReport({
      postId,
      reporterId: user.id,
      reason,
    });

    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const { error } = await supabase.from('content_moderation_logs').insert({
      post_id: postId,
      reporter_id: user.id,
      reason: reason.trim(),
      decision: 'pending',
    });

    if (error) {
      return { success: false, error: '举报失败，请重试' };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误' };
  }
}

/**
 * Review a reported/flagged post (moderator action).
 * Requirement 23.5: Confirmed violation → take down post.
 * Requirement 23.6: 3 cumulative violations → ban account.
 * Requirement 23.7: Log all moderation actions.
 */
export async function reviewPost(
  moderationLogId: string,
  decision: ModerationDecision,
  moderatorId: string,
): Promise<ActionResult<{ banned?: boolean }>> {
  try {
    const supabase = await createClient();

    // Update the moderation log
    const { data: logData, error: logError } = await supabase
      .from('content_moderation_logs')
      .update({
        decision,
        moderator_id: moderatorId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', moderationLogId)
      .select('post_id')
      .single();

    if (logError || !logData) {
      return { success: false, error: '更新审核记录失败' };
    }

    const postId = logData.post_id as string;

    if (decision === 'rejected') {
      // Take down the post
      const { error: postError } = await supabase
        .from('social_posts')
        .update({ status: 'rejected' })
        .eq('id', postId);

      if (postError) {
        return { success: false, error: '下架动态失败' };
      }

      // Get the post owner
      const { data: postData } = await supabase
        .from('social_posts')
        .select('user_id')
        .eq('id', postId)
        .single();

      if (postData) {
        const postUserId = postData.user_id as string;

        // Count confirmed violations for this user
        const { count } = await supabase
          .from('content_moderation_logs')
          .select('*', { count: 'exact', head: true })
          .eq('decision', 'rejected')
          .in(
            'post_id',
            (
              await supabase
                .from('social_posts')
                .select('id')
                .eq('user_id', postUserId)
            ).data?.map((p) => p.id as string) ?? [],
          );

        const banCheck = checkViolationBan(count ?? 0);

        if (banCheck.shouldBan) {
          // Ban the user: reject all their published posts
          await supabase
            .from('social_posts')
            .update({ status: 'rejected' })
            .eq('user_id', postUserId)
            .eq('status', 'published');

          // Also fail any active challenges
          await supabase
            .from('challenges')
            .update({ status: 'failed' })
            .eq('user_id', postUserId)
            .in('status', ['active', 'pending']);

          return { success: true, data: { banned: true } };
        }
      }
    }

    return { success: true, data: { banned: false } };
  } catch {
    return { success: false, error: '服务器错误' };
  }
}

/**
 * Get the manual review queue (pending moderation logs).
 * Requirement 23.4: Manual review queue.
 */
export async function getModerationQueue(): Promise<
  ActionResult<
    Array<{
      id: string;
      postId: string;
      reporterId: string | null;
      reason: string | null;
      aiResult: Record<string, unknown> | null;
      decision: string;
      createdAt: string;
    }>
  >
> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('content_moderation_logs')
      .select('*')
      .eq('decision', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      return { success: false, error: '获取审核队列失败' };
    }

    const queue = (data ?? []).map((row) => ({
      id: row.id as string,
      postId: row.post_id as string,
      reporterId: (row.reporter_id as string) ?? null,
      reason: (row.reason as string) ?? null,
      aiResult: (row.ai_result as Record<string, unknown>) ?? null,
      decision: row.decision as string,
      createdAt: row.created_at as string,
    }));

    return { success: true, data: queue };
  } catch {
    return { success: false, error: '服务器错误' };
  }
}

/**
 * Submit an appeal for a moderation decision.
 * Requirement 23.8: Provide user appeal channel.
 */
export async function submitAppeal(
  moderationLogId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const validation = validateAppeal({
      userId: user.id,
      moderationLogId,
      reason,
    });

    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Verify the moderation log exists and belongs to user's post
    const { data: logData } = await supabase
      .from('content_moderation_logs')
      .select('id, post_id, decision')
      .eq('id', moderationLogId)
      .single();

    if (!logData) {
      return { success: false, error: '审核记录不存在' };
    }

    if (logData.decision !== 'rejected') {
      return { success: false, error: '只能对被拒绝的内容进行申诉' };
    }

    // Verify the post belongs to the user
    const { data: postData } = await supabase
      .from('social_posts')
      .select('user_id')
      .eq('id', logData.post_id as string)
      .single();

    if (!postData || postData.user_id !== user.id) {
      return { success: false, error: '无权对此内容进行申诉' };
    }

    // Reset the moderation decision to pending for re-review
    const { error } = await supabase
      .from('content_moderation_logs')
      .update({
        decision: 'pending',
        reason: `[申诉] ${reason.trim()}`,
        reviewed_at: null,
        moderator_id: null,
      })
      .eq('id', moderationLogId);

    if (error) {
      return { success: false, error: '提交申诉失败，请重试' };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误' };
  }
}

/**
 * Take down a post (set status to rejected).
 * Requirement 23.5: Confirmed violation → take down post.
 */
export async function takeDownPost(postId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from('social_posts')
      .update({ status: 'rejected' })
      .eq('id', postId);

    if (error) {
      return { success: false, error: '下架动态失败' };
    }

    return { success: true };
  } catch {
    return { success: false, error: '服务器错误' };
  }
}

/**
 * Get a user's violation count.
 * Requirement 23.6: Track cumulative violations.
 */
export async function getUserViolationCount(
  userId: string,
): Promise<ActionResult<{ count: number; shouldBan: boolean }>> {
  try {
    const supabase = await createClient();

    // Get all post IDs for this user
    const { data: userPosts } = await supabase
      .from('social_posts')
      .select('id')
      .eq('user_id', userId);

    const postIds = (userPosts ?? []).map((p) => p.id as string);

    if (postIds.length === 0) {
      return { success: true, data: { count: 0, shouldBan: false } };
    }

    // Count rejected moderation logs for user's posts
    const { count } = await supabase
      .from('content_moderation_logs')
      .select('*', { count: 'exact', head: true })
      .eq('decision', 'rejected')
      .in('post_id', postIds);

    const violationCount = count ?? 0;
    const banCheck = checkViolationBan(violationCount);

    return {
      success: true,
      data: { count: violationCount, shouldBan: banCheck.shouldBan },
    };
  } catch {
    return { success: false, error: '服务器错误' };
  }
}

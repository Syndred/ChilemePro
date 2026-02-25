import { describe, it, expect } from 'vitest';
import {
  buildModerationPrompt,
  parseAIModerationResponse,
  shouldBlockContent,
  validateReport,
  checkViolationBan,
  validateAppeal,
  buildModerationLogEntry,
  determineAIDecision,
  getViolationCategoryLabel,
  VIOLATION_BAN_THRESHOLD,
  VIOLATION_CATEGORIES,
  type AIModerationResult,
} from './content-moderation';

// --- buildModerationPrompt ---

describe('buildModerationPrompt', () => {
  it('builds prompt with content only', () => {
    const prompt = buildModerationPrompt('今天吃了沙拉');
    expect(prompt).toContain('今天吃了沙拉');
    expect(prompt).toContain('违规');
    expect(prompt).not.toContain('图片描述');
  });

  it('builds prompt with content and image descriptions', () => {
    const prompt = buildModerationPrompt('美食分享', ['一碗面条', '一杯果汁']);
    expect(prompt).toContain('美食分享');
    expect(prompt).toContain('图片描述');
    expect(prompt).toContain('一碗面条');
    expect(prompt).toContain('一杯果汁');
  });

  it('builds prompt with empty image descriptions array', () => {
    const prompt = buildModerationPrompt('健康饮食', []);
    expect(prompt).toContain('健康饮食');
    expect(prompt).not.toContain('图片描述');
  });
});

// --- parseAIModerationResponse ---

describe('parseAIModerationResponse', () => {
  it('parses valid JSON response', () => {
    const response = JSON.stringify({
      isViolation: true,
      confidence: 0.95,
      categories: ['advertising'],
      reason: '包含广告内容',
    });
    const result = parseAIModerationResponse(response);
    expect(result.isViolation).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.categories).toEqual(['advertising']);
    expect(result.reason).toBe('包含广告内容');
  });

  it('parses JSON embedded in text', () => {
    const response = `审核结果如下：
    {"isViolation": false, "confidence": 0.1, "categories": [], "reason": "内容正常"}
    以上是审核结果。`;
    const result = parseAIModerationResponse(response);
    expect(result.isViolation).toBe(false);
    expect(result.confidence).toBe(0.1);
    expect(result.categories).toEqual([]);
  });

  it('returns safe default for invalid JSON', () => {
    const result = parseAIModerationResponse('not json at all');
    expect(result.isViolation).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.categories).toEqual([]);
    expect(result.reason).toContain('解析失败');
  });

  it('returns safe default for empty string', () => {
    const result = parseAIModerationResponse('');
    expect(result.isViolation).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it('clamps confidence to 0-1 range', () => {
    const response = JSON.stringify({
      isViolation: true,
      confidence: 1.5,
      categories: [],
      reason: 'test',
    });
    const result = parseAIModerationResponse(response);
    expect(result.confidence).toBe(1);
  });

  it('clamps negative confidence to 0', () => {
    const response = JSON.stringify({
      isViolation: true,
      confidence: -0.5,
      categories: [],
      reason: 'test',
    });
    const result = parseAIModerationResponse(response);
    expect(result.confidence).toBe(0);
  });

  it('filters out invalid categories', () => {
    const response = JSON.stringify({
      isViolation: true,
      confidence: 0.8,
      categories: ['advertising', 'invalid_category', 'vulgar'],
      reason: 'test',
    });
    const result = parseAIModerationResponse(response);
    expect(result.categories).toEqual(['advertising', 'vulgar']);
  });

  it('handles missing fields gracefully', () => {
    const response = JSON.stringify({ isViolation: true });
    const result = parseAIModerationResponse(response);
    expect(result.isViolation).toBe(true);
    expect(result.confidence).toBe(0);
    expect(result.categories).toEqual([]);
    expect(result.reason).toBe('');
  });
});

// --- shouldBlockContent ---

describe('shouldBlockContent', () => {
  it('blocks content with high confidence violation', () => {
    const aiResult: AIModerationResult = {
      isViolation: true,
      confidence: 0.9,
      categories: ['advertising'],
      reason: '广告内容',
    };
    const result = shouldBlockContent(aiResult);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('广告内容');
  });

  it('blocks content at exactly 0.7 confidence threshold', () => {
    const aiResult: AIModerationResult = {
      isViolation: true,
      confidence: 0.7,
      categories: ['vulgar'],
      reason: '低俗内容',
    };
    const result = shouldBlockContent(aiResult);
    expect(result.allowed).toBe(false);
  });

  it('allows content with low confidence violation', () => {
    const aiResult: AIModerationResult = {
      isViolation: true,
      confidence: 0.5,
      categories: ['spam'],
      reason: '可能是垃圾内容',
    };
    const result = shouldBlockContent(aiResult);
    expect(result.allowed).toBe(true);
  });

  it('allows non-violation content', () => {
    const aiResult: AIModerationResult = {
      isViolation: false,
      confidence: 0,
      categories: [],
      reason: '',
    };
    const result = shouldBlockContent(aiResult);
    expect(result.allowed).toBe(true);
  });

  it('provides default reason when AI reason is empty', () => {
    const aiResult: AIModerationResult = {
      isViolation: true,
      confidence: 0.9,
      categories: ['illegal'],
      reason: '',
    };
    const result = shouldBlockContent(aiResult);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});

// --- validateReport ---

describe('validateReport', () => {
  it('validates a correct report', () => {
    const result = validateReport({
      postId: 'post-123',
      reporterId: 'user-456',
      reason: '包含广告内容',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects empty postId', () => {
    const result = validateReport({
      postId: '',
      reporterId: 'user-456',
      reason: '广告',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('动态 ID');
  });

  it('rejects empty reporterId', () => {
    const result = validateReport({
      postId: 'post-123',
      reporterId: '',
      reason: '广告',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('举报人');
  });

  it('rejects empty reason', () => {
    const result = validateReport({
      postId: 'post-123',
      reporterId: 'user-456',
      reason: '',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('举报原因不能为空');
  });

  it('rejects whitespace-only reason', () => {
    const result = validateReport({
      postId: 'post-123',
      reporterId: 'user-456',
      reason: '   ',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('举报原因不能为空');
  });

  it('rejects reason exceeding 500 characters', () => {
    const result = validateReport({
      postId: 'post-123',
      reporterId: 'user-456',
      reason: 'a'.repeat(501),
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('500');
  });

  it('accepts reason at exactly 500 characters', () => {
    const result = validateReport({
      postId: 'post-123',
      reporterId: 'user-456',
      reason: 'a'.repeat(500),
    });
    expect(result.valid).toBe(true);
  });
});

// --- checkViolationBan ---

describe('checkViolationBan', () => {
  it('bans at exactly 3 violations', () => {
    const result = checkViolationBan(3);
    expect(result.shouldBan).toBe(true);
    expect(result.violationCount).toBe(3);
    expect(result.reason).toContain('封禁');
  });

  it('bans when violations exceed threshold', () => {
    const result = checkViolationBan(5);
    expect(result.shouldBan).toBe(true);
    expect(result.violationCount).toBe(5);
  });

  it('does not ban at 2 violations', () => {
    const result = checkViolationBan(2);
    expect(result.shouldBan).toBe(false);
    expect(result.violationCount).toBe(2);
    expect(result.reason).toBeUndefined();
  });

  it('does not ban at 0 violations', () => {
    const result = checkViolationBan(0);
    expect(result.shouldBan).toBe(false);
    expect(result.violationCount).toBe(0);
  });

  it('does not ban at 1 violation', () => {
    const result = checkViolationBan(1);
    expect(result.shouldBan).toBe(false);
  });
});

// --- validateAppeal ---

describe('validateAppeal', () => {
  it('validates a correct appeal', () => {
    const result = validateAppeal({
      userId: 'user-123',
      moderationLogId: 'log-456',
      reason: '我的内容不违规，请重新审核',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects empty userId', () => {
    const result = validateAppeal({
      userId: '',
      moderationLogId: 'log-456',
      reason: '申诉原因',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('用户 ID');
  });

  it('rejects empty moderationLogId', () => {
    const result = validateAppeal({
      userId: 'user-123',
      moderationLogId: '',
      reason: '申诉原因',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('审核记录 ID');
  });

  it('rejects empty reason', () => {
    const result = validateAppeal({
      userId: 'user-123',
      moderationLogId: 'log-456',
      reason: '',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('申诉原因不能为空');
  });

  it('rejects reason exceeding 1000 characters', () => {
    const result = validateAppeal({
      userId: 'user-123',
      moderationLogId: 'log-456',
      reason: 'a'.repeat(1001),
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('1000');
  });

  it('accepts reason at exactly 1000 characters', () => {
    const result = validateAppeal({
      userId: 'user-123',
      moderationLogId: 'log-456',
      reason: 'a'.repeat(1000),
    });
    expect(result.valid).toBe(true);
  });
});

// --- buildModerationLogEntry ---

describe('buildModerationLogEntry', () => {
  it('builds entry with all options', () => {
    const aiResult: AIModerationResult = {
      isViolation: true,
      confidence: 0.9,
      categories: ['advertising'],
      reason: '广告',
    };
    const entry = buildModerationLogEntry('post-1', 'rejected', {
      reporterId: 'user-2',
      reason: '广告内容',
      aiResult,
    });
    expect(entry.postId).toBe('post-1');
    expect(entry.decision).toBe('rejected');
    expect(entry.reporterId).toBe('user-2');
    expect(entry.reason).toBe('广告内容');
    expect(entry.aiResult).toBe(aiResult);
  });

  it('builds entry without options', () => {
    const entry = buildModerationLogEntry('post-1', 'approved');
    expect(entry.postId).toBe('post-1');
    expect(entry.decision).toBe('approved');
    expect(entry.reporterId).toBeUndefined();
    expect(entry.reason).toBeUndefined();
    expect(entry.aiResult).toBeUndefined();
  });
});

// --- determineAIDecision ---

describe('determineAIDecision', () => {
  it('returns rejected for high confidence violation', () => {
    const result = determineAIDecision({
      isViolation: true,
      confidence: 0.9,
      categories: ['illegal'],
      reason: 'test',
    });
    expect(result).toBe('rejected');
  });

  it('returns rejected at exactly 0.7 confidence', () => {
    const result = determineAIDecision({
      isViolation: true,
      confidence: 0.7,
      categories: ['vulgar'],
      reason: 'test',
    });
    expect(result).toBe('rejected');
  });

  it('returns pending for medium confidence violation', () => {
    const result = determineAIDecision({
      isViolation: true,
      confidence: 0.5,
      categories: ['spam'],
      reason: 'test',
    });
    expect(result).toBe('pending');
  });

  it('returns pending at exactly 0.4 confidence', () => {
    const result = determineAIDecision({
      isViolation: true,
      confidence: 0.4,
      categories: ['spam'],
      reason: 'test',
    });
    expect(result).toBe('pending');
  });

  it('returns approved for low confidence violation', () => {
    const result = determineAIDecision({
      isViolation: true,
      confidence: 0.3,
      categories: ['spam'],
      reason: 'test',
    });
    expect(result).toBe('approved');
  });

  it('returns approved for non-violation', () => {
    const result = determineAIDecision({
      isViolation: false,
      confidence: 0,
      categories: [],
      reason: '',
    });
    expect(result).toBe('approved');
  });
});

// --- getViolationCategoryLabel ---

describe('getViolationCategoryLabel', () => {
  it('returns correct label for each category', () => {
    expect(getViolationCategoryLabel('illegal')).toBe('违法内容');
    expect(getViolationCategoryLabel('vulgar')).toBe('低俗内容');
    expect(getViolationCategoryLabel('advertising')).toBe('广告内容');
    expect(getViolationCategoryLabel('diversion')).toBe('导流内容');
    expect(getViolationCategoryLabel('harassment')).toBe('骚扰内容');
    expect(getViolationCategoryLabel('spam')).toBe('垃圾内容');
  });
});

// --- Constants ---

describe('content moderation constants', () => {
  it('VIOLATION_BAN_THRESHOLD is 3', () => {
    expect(VIOLATION_BAN_THRESHOLD).toBe(3);
  });

  it('VIOLATION_CATEGORIES contains all expected categories', () => {
    expect(VIOLATION_CATEGORIES).toContain('illegal');
    expect(VIOLATION_CATEGORIES).toContain('vulgar');
    expect(VIOLATION_CATEGORIES).toContain('advertising');
    expect(VIOLATION_CATEGORIES).toContain('diversion');
    expect(VIOLATION_CATEGORIES).toContain('harassment');
    expect(VIOLATION_CATEGORIES).toContain('spam');
    expect(VIOLATION_CATEGORIES).toHaveLength(6);
  });
});

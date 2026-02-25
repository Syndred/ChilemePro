import { describe, it, expect } from 'vitest';
import {
  checkDeviceUniqueness,
  checkPhoneUniqueness,
  checkPaymentAccountUniqueness,
  checkIdentifierUniqueness,
  checkImageHashDuplicate,
  detectBatchAddPattern,
  detectTimeAnomaly,
  shouldBanAccount,
  checkIdentityConsistency,
  buildAntiCheatLogEntry,
  determineSeverity,
  validateChallengeEligibility,
  BATCH_ADD_THRESHOLD,
  BATCH_ADD_WINDOW_MINUTES,
  MIN_RECORD_INTERVAL_SECONDS,
  AUTO_BAN_VIOLATION_THRESHOLD,
} from './anti-cheat';

// --- checkDeviceUniqueness ---

describe('checkDeviceUniqueness', () => {
  it('allows a new device ID not in active list', () => {
    const result = checkDeviceUniqueness({
      identifier: 'device-abc',
      activeIdentifiers: ['device-xyz', 'device-123'],
    });
    expect(result.allowed).toBe(true);
  });

  it('rejects a device ID already in active list', () => {
    const result = checkDeviceUniqueness({
      identifier: 'device-abc',
      activeIdentifiers: ['device-abc', 'device-xyz'],
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('设备');
  });

  it('rejects empty device ID', () => {
    const result = checkDeviceUniqueness({
      identifier: '',
      activeIdentifiers: [],
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('设备 ID');
  });

  it('allows when active list is empty', () => {
    const result = checkDeviceUniqueness({
      identifier: 'device-abc',
      activeIdentifiers: [],
    });
    expect(result.allowed).toBe(true);
  });
});

// --- checkPhoneUniqueness ---

describe('checkPhoneUniqueness', () => {
  it('allows a new phone not in active list', () => {
    const result = checkPhoneUniqueness({
      identifier: '13800138001',
      activeIdentifiers: ['13800138002'],
    });
    expect(result.allowed).toBe(true);
  });

  it('rejects a phone already in active list', () => {
    const result = checkPhoneUniqueness({
      identifier: '13800138001',
      activeIdentifiers: ['13800138001'],
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('手机号');
  });

  it('rejects empty phone', () => {
    const result = checkPhoneUniqueness({
      identifier: '',
      activeIdentifiers: [],
    });
    expect(result.allowed).toBe(false);
  });
});

// --- checkPaymentAccountUniqueness ---

describe('checkPaymentAccountUniqueness', () => {
  it('allows a new payment account', () => {
    const result = checkPaymentAccountUniqueness({
      identifier: 'pay-001',
      activeIdentifiers: ['pay-002'],
    });
    expect(result.allowed).toBe(true);
  });

  it('rejects a duplicate payment account', () => {
    const result = checkPaymentAccountUniqueness({
      identifier: 'pay-001',
      activeIdentifiers: ['pay-001'],
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('支付账户');
  });

  it('rejects empty payment account', () => {
    const result = checkPaymentAccountUniqueness({
      identifier: '  ',
      activeIdentifiers: [],
    });
    expect(result.allowed).toBe(false);
  });
});

// --- checkIdentifierUniqueness ---

describe('checkIdentifierUniqueness', () => {
  it('works with custom label', () => {
    const result = checkIdentifierUniqueness('id-1', ['id-1'], '邮箱');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('邮箱');
  });

  it('allows unique identifier', () => {
    const result = checkIdentifierUniqueness('id-2', ['id-1'], '邮箱');
    expect(result.allowed).toBe(true);
  });
});

// --- checkImageHashDuplicate ---

describe('checkImageHashDuplicate', () => {
  it('detects duplicate image hash', () => {
    const result = checkImageHashDuplicate({
      imageHash: 'abc123',
      existingHashes: ['abc123', 'def456'],
    });
    expect(result.isDuplicate).toBe(true);
    expect(result.reason).toContain('重复');
  });

  it('allows unique image hash', () => {
    const result = checkImageHashDuplicate({
      imageHash: 'ghi789',
      existingHashes: ['abc123', 'def456'],
    });
    expect(result.isDuplicate).toBe(false);
  });

  it('handles empty image hash gracefully', () => {
    const result = checkImageHashDuplicate({
      imageHash: '',
      existingHashes: ['abc123'],
    });
    expect(result.isDuplicate).toBe(false);
  });

  it('handles empty existing hashes', () => {
    const result = checkImageHashDuplicate({
      imageHash: 'abc123',
      existingHashes: [],
    });
    expect(result.isDuplicate).toBe(false);
  });
});

// --- detectBatchAddPattern ---

describe('detectBatchAddPattern', () => {
  it('does not flag when below threshold', () => {
    const timestamps = [
      { recordedAt: new Date('2025-06-15T12:00:00') },
      { recordedAt: new Date('2025-06-15T12:01:00') },
    ];
    const result = detectBatchAddPattern(timestamps);
    expect(result.isSuspicious).toBe(false);
  });

  it('flags when threshold records within window', () => {
    const base = new Date('2025-06-15T12:00:00');
    const timestamps = Array.from({ length: BATCH_ADD_THRESHOLD }, (_, i) => ({
      recordedAt: new Date(base.getTime() + i * 60 * 1000), // 1 min apart
    }));
    const result = detectBatchAddPattern(timestamps);
    expect(result.isSuspicious).toBe(true);
    expect(result.severity).toBe('medium');
    expect(result.reason).toContain('批量添加');
  });

  it('does not flag when records are spread out', () => {
    const base = new Date('2025-06-15T12:00:00');
    const timestamps = Array.from({ length: BATCH_ADD_THRESHOLD }, (_, i) => ({
      recordedAt: new Date(base.getTime() + i * 30 * 60 * 1000), // 30 min apart
    }));
    const result = detectBatchAddPattern(timestamps);
    expect(result.isSuspicious).toBe(false);
  });

  it('handles empty timestamps', () => {
    const result = detectBatchAddPattern([]);
    expect(result.isSuspicious).toBe(false);
  });

  it('respects custom window and threshold', () => {
    const base = new Date('2025-06-15T12:00:00');
    const timestamps = [
      { recordedAt: new Date(base.getTime()) },
      { recordedAt: new Date(base.getTime() + 1000) },
      { recordedAt: new Date(base.getTime() + 2000) },
    ];
    const result = detectBatchAddPattern(timestamps, 1, 3);
    expect(result.isSuspicious).toBe(true);
  });
});

// --- detectTimeAnomaly ---

describe('detectTimeAnomaly', () => {
  it('does not flag single record', () => {
    const result = detectTimeAnomaly([
      { recordedAt: new Date('2025-06-15T12:00:00') },
    ]);
    expect(result.isSuspicious).toBe(false);
  });

  it('flags records too close together', () => {
    const base = new Date('2025-06-15T12:00:00');
    const timestamps = [
      { recordedAt: base },
      { recordedAt: new Date(base.getTime() + 10 * 1000) }, // 10 seconds
    ];
    const result = detectTimeAnomaly(timestamps);
    expect(result.isSuspicious).toBe(true);
    expect(result.reason).toContain('秒');
  });

  it('does not flag records with sufficient interval', () => {
    const base = new Date('2025-06-15T12:00:00');
    const timestamps = [
      { recordedAt: base },
      { recordedAt: new Date(base.getTime() + 60 * 1000) }, // 60 seconds
    ];
    const result = detectTimeAnomaly(timestamps);
    expect(result.isSuspicious).toBe(false);
  });

  it('handles empty timestamps', () => {
    const result = detectTimeAnomaly([]);
    expect(result.isSuspicious).toBe(false);
  });

  it('handles unsorted timestamps', () => {
    const base = new Date('2025-06-15T12:00:00');
    const timestamps = [
      { recordedAt: new Date(base.getTime() + 5 * 1000) },
      { recordedAt: base },
    ];
    const result = detectTimeAnomaly(timestamps);
    expect(result.isSuspicious).toBe(true);
  });
});

// --- shouldBanAccount ---

describe('shouldBanAccount', () => {
  it('returns shouldBan true when already banned', () => {
    const result = shouldBanAccount({ highSeverityCount: 0, isBanned: true });
    expect(result.shouldBan).toBe(true);
    expect(result.reason).toContain('已被封禁');
  });

  it('returns shouldBan true when violations reach threshold', () => {
    const result = shouldBanAccount({
      highSeverityCount: AUTO_BAN_VIOLATION_THRESHOLD,
      isBanned: false,
    });
    expect(result.shouldBan).toBe(true);
    expect(result.reason).toContain('封禁');
  });

  it('returns shouldBan true when violations exceed threshold', () => {
    const result = shouldBanAccount({
      highSeverityCount: AUTO_BAN_VIOLATION_THRESHOLD + 2,
      isBanned: false,
    });
    expect(result.shouldBan).toBe(true);
  });

  it('returns shouldBan false when below threshold', () => {
    const result = shouldBanAccount({
      highSeverityCount: AUTO_BAN_VIOLATION_THRESHOLD - 1,
      isBanned: false,
    });
    expect(result.shouldBan).toBe(false);
  });

  it('returns shouldBan false with zero violations', () => {
    const result = shouldBanAccount({ highSeverityCount: 0, isBanned: false });
    expect(result.shouldBan).toBe(false);
  });
});

// --- checkIdentityConsistency ---

describe('checkIdentityConsistency', () => {
  it('returns consistent when identities match', () => {
    const result = checkIdentityConsistency({
      paymentIdentity: 'user@wechat',
      withdrawalIdentity: 'user@wechat',
    });
    expect(result.isConsistent).toBe(true);
  });

  it('returns inconsistent when identities differ', () => {
    const result = checkIdentityConsistency({
      paymentIdentity: 'user@wechat',
      withdrawalIdentity: 'other@alipay',
    });
    expect(result.isConsistent).toBe(false);
    expect(result.reason).toContain('不一致');
  });

  it('trims whitespace before comparing', () => {
    const result = checkIdentityConsistency({
      paymentIdentity: '  user@wechat  ',
      withdrawalIdentity: 'user@wechat',
    });
    expect(result.isConsistent).toBe(true);
  });

  it('rejects empty payment identity', () => {
    const result = checkIdentityConsistency({
      paymentIdentity: '',
      withdrawalIdentity: 'user@wechat',
    });
    expect(result.isConsistent).toBe(false);
    expect(result.reason).toContain('支付身份');
  });

  it('rejects empty withdrawal identity', () => {
    const result = checkIdentityConsistency({
      paymentIdentity: 'user@wechat',
      withdrawalIdentity: '',
    });
    expect(result.isConsistent).toBe(false);
    expect(result.reason).toContain('提现身份');
  });
});

// --- buildAntiCheatLogEntry ---

describe('buildAntiCheatLogEntry', () => {
  it('builds a log entry with all fields', () => {
    const entry = buildAntiCheatLogEntry(
      'user-1',
      'duplicate_image',
      '重复图片',
      'high',
      'device-abc',
    );
    expect(entry.userId).toBe('user-1');
    expect(entry.deviceId).toBe('device-abc');
    expect(entry.actionType).toBe('duplicate_image');
    expect(entry.suspiciousReason).toBe('重复图片');
    expect(entry.severity).toBe('high');
  });

  it('builds a log entry without optional deviceId', () => {
    const entry = buildAntiCheatLogEntry(
      'user-1',
      'batch_add',
      '批量添加',
      'medium',
    );
    expect(entry.deviceId).toBeUndefined();
  });
});

// --- determineSeverity ---

describe('determineSeverity', () => {
  it('returns high for duplicate_image', () => {
    expect(determineSeverity('duplicate_image')).toBe('high');
  });

  it('returns high for identity_mismatch', () => {
    expect(determineSeverity('identity_mismatch')).toBe('high');
  });

  it('returns high for account_ban', () => {
    expect(determineSeverity('account_ban')).toBe('high');
  });

  it('returns medium for batch_add', () => {
    expect(determineSeverity('batch_add')).toBe('medium');
  });

  it('returns medium for device_duplicate', () => {
    expect(determineSeverity('device_duplicate')).toBe('medium');
  });

  it('returns medium for phone_duplicate', () => {
    expect(determineSeverity('phone_duplicate')).toBe('medium');
  });

  it('returns medium for payment_duplicate', () => {
    expect(determineSeverity('payment_duplicate')).toBe('medium');
  });

  it('returns low for unknown action types', () => {
    expect(determineSeverity('unknown_action')).toBe('low');
  });
});

// --- validateChallengeEligibility ---

describe('validateChallengeEligibility', () => {
  it('returns eligible when all checks pass', () => {
    const result = validateChallengeEligibility({
      deviceId: 'device-new',
      phone: '13800138001',
      paymentAccount: 'pay-new',
      activeDeviceIds: ['device-old'],
      activePhones: ['13800138002'],
      activePaymentAccounts: ['pay-old'],
    });
    expect(result.eligible).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.reasons).toHaveLength(0);
  });

  it('returns ineligible when device is duplicate', () => {
    const result = validateChallengeEligibility({
      deviceId: 'device-dup',
      phone: '13800138001',
      paymentAccount: 'pay-new',
      activeDeviceIds: ['device-dup'],
      activePhones: [],
      activePaymentAccounts: [],
    });
    expect(result.eligible).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.reasons[0]).toContain('设备');
  });

  it('returns ineligible when phone is duplicate', () => {
    const result = validateChallengeEligibility({
      deviceId: 'device-new',
      phone: '13800138001',
      paymentAccount: 'pay-new',
      activeDeviceIds: [],
      activePhones: ['13800138001'],
      activePaymentAccounts: [],
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain('手机号');
  });

  it('returns ineligible when payment account is duplicate', () => {
    const result = validateChallengeEligibility({
      deviceId: 'device-new',
      phone: '13800138001',
      paymentAccount: 'pay-dup',
      activeDeviceIds: [],
      activePhones: [],
      activePaymentAccounts: ['pay-dup'],
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain('支付账户');
  });

  it('collects multiple violations', () => {
    const result = validateChallengeEligibility({
      deviceId: 'device-dup',
      phone: '13800138001',
      paymentAccount: 'pay-dup',
      activeDeviceIds: ['device-dup'],
      activePhones: ['13800138001'],
      activePaymentAccounts: ['pay-dup'],
    });
    expect(result.eligible).toBe(false);
    expect(result.violations.length).toBe(3);
    expect(result.reasons.length).toBe(3);
  });
});

// --- Constants ---

describe('anti-cheat constants', () => {
  it('BATCH_ADD_THRESHOLD is 5', () => {
    expect(BATCH_ADD_THRESHOLD).toBe(5);
  });

  it('BATCH_ADD_WINDOW_MINUTES is 10', () => {
    expect(BATCH_ADD_WINDOW_MINUTES).toBe(10);
  });

  it('MIN_RECORD_INTERVAL_SECONDS is 30', () => {
    expect(MIN_RECORD_INTERVAL_SECONDS).toBe(30);
  });

  it('AUTO_BAN_VIOLATION_THRESHOLD is 3', () => {
    expect(AUTO_BAN_VIOLATION_THRESHOLD).toBe(3);
  });
});

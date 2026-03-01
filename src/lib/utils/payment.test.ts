import { describe, it, expect } from 'vitest';
import {
  validatePaymentAmount,
  toStripeAmount,
  fromStripeAmount,
  buildPaymentIntent,
  mapStripeStatus,
  getMembershipTierFromAmount,
  calculateMembershipExpiry,
  canRetryPayment,
  getPaymentDescription,
  MEMBERSHIP_PRICES,
  STRIPE_CURRENCY,
  MAX_PAYMENT_AMOUNT,
} from './payment';

// --- validatePaymentAmount ---

describe('validatePaymentAmount', () => {
  it('accepts valid deposit amount (100)', () => {
    const result = validatePaymentAmount(100, 'deposit');
    expect(result.valid).toBe(true);
  });

  it('rejects deposit with wrong amount', () => {
    const result = validatePaymentAmount(50, 'deposit');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('100');
  });

  it('accepts valid monthly membership amount', () => {
    const result = validatePaymentAmount(MEMBERSHIP_PRICES.monthly, 'membership');
    expect(result.valid).toBe(true);
  });

  it('accepts valid yearly membership amount', () => {
    const result = validatePaymentAmount(MEMBERSHIP_PRICES.yearly, 'membership');
    expect(result.valid).toBe(true);
  });

  it('rejects invalid membership amount', () => {
    const result = validatePaymentAmount(50, 'membership');
    expect(result.valid).toBe(false);
  });

  it('rejects NaN', () => {
    const result = validatePaymentAmount(NaN, 'deposit');
    expect(result.valid).toBe(false);
  });

  it('rejects Infinity', () => {
    const result = validatePaymentAmount(Infinity, 'deposit');
    expect(result.valid).toBe(false);
  });

  it('rejects negative amount', () => {
    const result = validatePaymentAmount(-10, 'deposit');
    expect(result.valid).toBe(false);
  });

  it('rejects zero amount', () => {
    const result = validatePaymentAmount(0, 'deposit');
    expect(result.valid).toBe(false);
  });

  it('rejects amount exceeding maximum', () => {
    const result = validatePaymentAmount(MAX_PAYMENT_AMOUNT + 1, 'deposit');
    expect(result.valid).toBe(false);
  });
});

// --- toStripeAmount / fromStripeAmount ---

describe('toStripeAmount', () => {
  it('converts yuan to fen correctly', () => {
    expect(toStripeAmount(100)).toBe(10000);
    expect(toStripeAmount(29.9)).toBe(2990);
    expect(toStripeAmount(0.01)).toBe(1);
  });

  it('rounds to nearest integer', () => {
    // 1.005 * 100 = 100.49999... due to floating point, rounds to 100
    expect(toStripeAmount(1.005)).toBe(100);
    expect(toStripeAmount(1.006)).toBe(101);
    expect(toStripeAmount(1.004)).toBe(100);
  });

  it('handles zero', () => {
    expect(toStripeAmount(0)).toBe(0);
  });
});

describe('fromStripeAmount', () => {
  it('converts fen to yuan correctly', () => {
    expect(fromStripeAmount(10000)).toBe(100);
    expect(fromStripeAmount(2990)).toBe(29.9);
    expect(fromStripeAmount(1)).toBe(0.01);
  });

  it('handles zero', () => {
    expect(fromStripeAmount(0)).toBe(0);
  });
});

describe('toStripeAmount and fromStripeAmount roundtrip', () => {
  it('roundtrips common amounts', () => {
    const amounts = [100, 29.9, 299, 0.01, 50.5];
    for (const amount of amounts) {
      expect(fromStripeAmount(toStripeAmount(amount))).toBeCloseTo(amount, 2);
    }
  });
});

// --- buildPaymentIntent ---

describe('buildPaymentIntent', () => {
  it('builds valid deposit intent', () => {
    const result = buildPaymentIntent({
      type: 'deposit',
      amount: 100,
      userId: 'user-123',
      challengeId: 'challenge-456',
    });
    expect(result.valid).toBe(true);
    expect(result.amountInCents).toBe(10000);
    expect(result.currency).toBe(STRIPE_CURRENCY);
    expect(result.metadata.userId).toBe('user-123');
    expect(result.metadata.type).toBe('deposit');
    expect(result.metadata.challengeId).toBe('challenge-456');
  });

  it('builds valid membership intent', () => {
    const result = buildPaymentIntent({
      type: 'membership',
      amount: MEMBERSHIP_PRICES.monthly,
      userId: 'user-123',
    });
    expect(result.valid).toBe(true);
    expect(result.amountInCents).toBe(toStripeAmount(MEMBERSHIP_PRICES.monthly));
    expect(result.metadata.challengeId).toBeUndefined();
  });

  it('returns invalid for wrong deposit amount', () => {
    const result = buildPaymentIntent({
      type: 'deposit',
      amount: 50,
      userId: 'user-123',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns invalid for NaN amount', () => {
    const result = buildPaymentIntent({
      type: 'deposit',
      amount: NaN,
      userId: 'user-123',
    });
    expect(result.valid).toBe(false);
  });
});

// --- mapStripeStatus ---

describe('mapStripeStatus', () => {
  it('maps succeeded to completed', () => {
    expect(mapStripeStatus('succeeded')).toBe('completed');
  });

  it('maps processing to processing', () => {
    expect(mapStripeStatus('processing')).toBe('processing');
  });

  it('maps requires_payment_method to pending', () => {
    expect(mapStripeStatus('requires_payment_method')).toBe('pending');
  });

  it('maps requires_confirmation to pending', () => {
    expect(mapStripeStatus('requires_confirmation')).toBe('pending');
  });

  it('maps requires_action to pending', () => {
    expect(mapStripeStatus('requires_action')).toBe('pending');
  });

  it('maps canceled to failed', () => {
    expect(mapStripeStatus('canceled')).toBe('failed');
  });

  it('maps unknown status to pending', () => {
    expect(mapStripeStatus('unknown_status')).toBe('pending');
  });
});

// --- getMembershipTierFromAmount ---

describe('getMembershipTierFromAmount', () => {
  it('returns monthly for monthly price', () => {
    expect(getMembershipTierFromAmount(MEMBERSHIP_PRICES.monthly)).toBe('monthly');
  });

  it('returns yearly for yearly price', () => {
    expect(getMembershipTierFromAmount(MEMBERSHIP_PRICES.yearly)).toBe('yearly');
  });

  it('returns null for unrecognized amount', () => {
    expect(getMembershipTierFromAmount(50)).toBeNull();
    expect(getMembershipTierFromAmount(0)).toBeNull();
  });
});

// --- calculateMembershipExpiry ---

describe('calculateMembershipExpiry', () => {
  it('extends from now when no current membership', () => {
    const before = new Date();
    const expiry = calculateMembershipExpiry(null, 'monthly');
    // Should be roughly 1 month from now
    const expected = new Date(before);
    expected.setMonth(expected.getMonth() + 1);
    expect(expiry.getMonth()).toBe(expected.getMonth());
  });

  it('extends from current expiry when membership is still active', () => {
    // Use a date far in the future so it's always "active"
    const futureExpiry = new Date();
    futureExpiry.setFullYear(futureExpiry.getFullYear() + 1);
    const expectedMonth = (futureExpiry.getMonth() + 1) % 12;

    const expiry = calculateMembershipExpiry(futureExpiry, 'monthly');
    expect(expiry.getMonth()).toBe(expectedMonth);
  });

  it('extends from now when membership has expired', () => {
    const pastExpiry = new Date('2020-01-01T00:00:00Z');
    const expiry = calculateMembershipExpiry(pastExpiry, 'yearly');
    // Should be 1 year from now, not from the past expiry
    const now = new Date();
    expect(expiry.getFullYear()).toBe(now.getFullYear() + 1);
  });

  it('adds 1 year for yearly tier', () => {
    // Use a date far in the future so it's always "active"
    const futureExpiry = new Date();
    futureExpiry.setFullYear(futureExpiry.getFullYear() + 2);
    const expectedYear = futureExpiry.getFullYear() + 1;

    const expiry = calculateMembershipExpiry(futureExpiry, 'yearly');
    expect(expiry.getFullYear()).toBe(expectedYear);
  });
});

// --- canRetryPayment ---

describe('canRetryPayment', () => {
  it('allows retry for failed status', () => {
    expect(canRetryPayment('failed')).toBe(true);
  });

  it('allows retry for pending status', () => {
    expect(canRetryPayment('pending')).toBe(true);
  });

  it('disallows retry for completed status', () => {
    expect(canRetryPayment('completed')).toBe(false);
  });

  it('disallows retry for processing status', () => {
    expect(canRetryPayment('processing')).toBe(false);
  });
});

// --- getPaymentDescription ---

describe('getPaymentDescription', () => {
  it('returns deposit description', () => {
    const desc = getPaymentDescription('deposit', 100);
    expect(desc).toContain('押金');
    expect(desc).toContain('100');
  });

  it('returns monthly membership description', () => {
    const desc = getPaymentDescription('membership', MEMBERSHIP_PRICES.monthly);
    expect(desc).toContain('月度');
  });

  it('returns yearly membership description', () => {
    const desc = getPaymentDescription('membership', MEMBERSHIP_PRICES.yearly);
    expect(desc).toContain('年度');
  });

  it('returns generic description for unknown membership amount', () => {
    const desc = getPaymentDescription('membership', 999);
    expect(desc).toContain('支付');
  });
});


// --- WeChat Pay & Alipay Utility Tests ---
// Requirement 18.2: WeChat Pay integration
// Requirement 18.3: Alipay integration

import {
  toWechatAmount,
  fromWechatAmount,
  toAlipayAmount,
  fromAlipayAmount,
  generateOutTradeNo,
  buildWechatPayOrder,
  buildAlipayOrder,
  mapWechatTradeState,
  mapAlipayTradeStatus,
  verifyWechatSignature,
  verifyAlipaySignature,
} from './payment';

// --- toWechatAmount / fromWechatAmount ---

describe('toWechatAmount', () => {
  it('converts yuan to fen correctly', () => {
    expect(toWechatAmount(100)).toBe(10000);
    expect(toWechatAmount(29.9)).toBe(2990);
    expect(toWechatAmount(0.01)).toBe(1);
  });

  it('rounds to nearest integer', () => {
    expect(toWechatAmount(1.006)).toBe(101);
    expect(toWechatAmount(1.004)).toBe(100);
  });

  it('handles zero', () => {
    expect(toWechatAmount(0)).toBe(0);
  });
});

describe('fromWechatAmount', () => {
  it('converts fen to yuan correctly', () => {
    expect(fromWechatAmount(10000)).toBe(100);
    expect(fromWechatAmount(2990)).toBe(29.9);
    expect(fromWechatAmount(1)).toBe(0.01);
  });

  it('handles zero', () => {
    expect(fromWechatAmount(0)).toBe(0);
  });
});

// --- toAlipayAmount / fromAlipayAmount ---

describe('toAlipayAmount', () => {
  it('formats amount with 2 decimal places', () => {
    expect(toAlipayAmount(100)).toBe('100.00');
    expect(toAlipayAmount(29.9)).toBe('29.90');
    expect(toAlipayAmount(0.01)).toBe('0.01');
    expect(toAlipayAmount(0.1)).toBe('0.10');
  });
});

describe('fromAlipayAmount', () => {
  it('parses valid amount strings', () => {
    expect(fromAlipayAmount('100.00')).toBe(100);
    expect(fromAlipayAmount('29.90')).toBe(29.9);
    expect(fromAlipayAmount('0.01')).toBe(0.01);
  });

  it('returns 0 for invalid strings', () => {
    expect(fromAlipayAmount('abc')).toBe(0);
    expect(fromAlipayAmount('')).toBe(0);
  });
});

// --- generateOutTradeNo ---

describe('generateOutTradeNo', () => {
  it('generates wechat trade no with WX prefix', () => {
    const tradeNo = generateOutTradeNo('wechat');
    expect(tradeNo).toMatch(/^WX_/);
  });

  it('generates alipay trade no with ZFB prefix', () => {
    const tradeNo = generateOutTradeNo('alipay');
    expect(tradeNo).toMatch(/^ZFB_/);
  });

  it('generates unique trade numbers', () => {
    const a = generateOutTradeNo('wechat');
    const b = generateOutTradeNo('wechat');
    expect(a).not.toBe(b);
  });
});

// --- buildWechatPayOrder ---

describe('buildWechatPayOrder', () => {
  it('builds valid deposit order', () => {
    const result = buildWechatPayOrder({
      type: 'deposit',
      amount: 100,
      userId: 'user-123',
      challengeId: 'challenge-456',
      openId: 'wx_open_id_abc',
      clientIp: '192.168.1.1',
    });
    expect(result.valid).toBe(true);
    expect(result.totalFee).toBe(10000);
    expect(result.openId).toBe('wx_open_id_abc');
    expect(result.body).toContain('押金');
    expect(result.metadata.userId).toBe('user-123');
    expect(result.metadata.challengeId).toBe('challenge-456');
    expect(result.outTradeNo).toMatch(/^WX_/);
  });

  it('builds valid membership order', () => {
    const result = buildWechatPayOrder({
      type: 'membership',
      amount: MEMBERSHIP_PRICES.monthly,
      userId: 'user-123',
      openId: 'wx_open_id_abc',
      clientIp: '192.168.1.1',
    });
    expect(result.valid).toBe(true);
    expect(result.totalFee).toBe(toWechatAmount(MEMBERSHIP_PRICES.monthly));
    expect(result.metadata.challengeId).toBeUndefined();
  });

  it('returns invalid for wrong deposit amount', () => {
    const result = buildWechatPayOrder({
      type: 'deposit',
      amount: 50,
      userId: 'user-123',
      openId: 'wx_open_id_abc',
      clientIp: '192.168.1.1',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns invalid when openId is missing', () => {
    const result = buildWechatPayOrder({
      type: 'deposit',
      amount: 100,
      userId: 'user-123',
      openId: '',
      clientIp: '192.168.1.1',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('openId');
  });
});

// --- buildAlipayOrder ---

describe('buildAlipayOrder', () => {
  it('builds valid deposit order', () => {
    const result = buildAlipayOrder({
      type: 'deposit',
      amount: 100,
      userId: 'user-123',
      challengeId: 'challenge-456',
      returnUrl: 'https://example.com/return',
    });
    expect(result.valid).toBe(true);
    expect(result.totalAmount).toBe('100.00');
    expect(result.subject).toContain('押金');
    expect(result.metadata.userId).toBe('user-123');
    expect(result.metadata.challengeId).toBe('challenge-456');
    expect(result.outTradeNo).toMatch(/^ZFB_/);
  });

  it('builds valid membership order', () => {
    const result = buildAlipayOrder({
      type: 'membership',
      amount: MEMBERSHIP_PRICES.yearly,
      userId: 'user-123',
      returnUrl: 'https://example.com/return',
    });
    expect(result.valid).toBe(true);
    expect(result.totalAmount).toBe(MEMBERSHIP_PRICES.yearly.toFixed(2));
    expect(result.metadata.challengeId).toBeUndefined();
  });

  it('returns invalid for wrong deposit amount', () => {
    const result = buildAlipayOrder({
      type: 'deposit',
      amount: 50,
      userId: 'user-123',
      returnUrl: 'https://example.com/return',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// --- mapWechatTradeState ---

describe('mapWechatTradeState', () => {
  it('maps SUCCESS to completed', () => {
    expect(mapWechatTradeState('SUCCESS')).toBe('completed');
  });

  it('maps USERPAYING to processing', () => {
    expect(mapWechatTradeState('USERPAYING')).toBe('processing');
  });

  it('maps NOTPAY to pending', () => {
    expect(mapWechatTradeState('NOTPAY')).toBe('pending');
  });

  it('maps CLOSED to failed', () => {
    expect(mapWechatTradeState('CLOSED')).toBe('failed');
  });

  it('maps PAYERROR to failed', () => {
    expect(mapWechatTradeState('PAYERROR')).toBe('failed');
  });

  it('maps REFUND to failed', () => {
    expect(mapWechatTradeState('REFUND')).toBe('failed');
  });

  it('maps REVOKED to pending', () => {
    expect(mapWechatTradeState('REVOKED')).toBe('pending');
  });

  it('is case-insensitive', () => {
    expect(mapWechatTradeState('success')).toBe('completed');
    expect(mapWechatTradeState('Success')).toBe('completed');
  });

  it('maps unknown status to pending', () => {
    expect(mapWechatTradeState('UNKNOWN')).toBe('pending');
  });
});

// --- mapAlipayTradeStatus ---

describe('mapAlipayTradeStatus', () => {
  it('maps TRADE_SUCCESS to completed', () => {
    expect(mapAlipayTradeStatus('TRADE_SUCCESS')).toBe('completed');
  });

  it('maps TRADE_FINISHED to completed', () => {
    expect(mapAlipayTradeStatus('TRADE_FINISHED')).toBe('completed');
  });

  it('maps WAIT_BUYER_PAY to pending', () => {
    expect(mapAlipayTradeStatus('WAIT_BUYER_PAY')).toBe('pending');
  });

  it('maps TRADE_CLOSED to failed', () => {
    expect(mapAlipayTradeStatus('TRADE_CLOSED')).toBe('failed');
  });

  it('is case-insensitive', () => {
    expect(mapAlipayTradeStatus('trade_success')).toBe('completed');
  });

  it('maps unknown status to pending', () => {
    expect(mapAlipayTradeStatus('UNKNOWN')).toBe('pending');
  });
});

// --- verifyWechatSignature ---

describe('verifyWechatSignature', () => {
  it('returns false for empty params', () => {
    expect(verifyWechatSignature({}, 'api_key')).toBe(false);
  });

  it('returns false for empty api key', () => {
    expect(verifyWechatSignature({ sign: 'abc', foo: 'bar' }, '')).toBe(false);
  });

  it('returns false when sign is missing', () => {
    expect(verifyWechatSignature({ foo: 'bar' }, 'api_key')).toBe(false);
  });

  it('returns true for valid structure with sign', () => {
    expect(verifyWechatSignature(
      { sign: 'abc123', out_trade_no: 'WX_123', total_fee: '10000' },
      'api_key',
    )).toBe(true);
  });

  it('returns false when only sign is present (no other params)', () => {
    expect(verifyWechatSignature({ sign: 'abc123' }, 'api_key')).toBe(false);
  });
});

// --- verifyAlipaySignature ---

describe('verifyAlipaySignature', () => {
  it('returns false for empty params', () => {
    expect(verifyAlipaySignature({}, 'public_key')).toBe(false);
  });

  it('returns false for empty public key', () => {
    expect(verifyAlipaySignature({ sign: 'abc', sign_type: 'RSA2' }, '')).toBe(false);
  });

  it('returns false when sign is missing', () => {
    expect(verifyAlipaySignature({ sign_type: 'RSA2', foo: 'bar' }, 'public_key')).toBe(false);
  });

  it('returns false when sign_type is missing', () => {
    expect(verifyAlipaySignature({ sign: 'abc', foo: 'bar' }, 'public_key')).toBe(false);
  });

  it('returns true for valid structure', () => {
    expect(verifyAlipaySignature(
      { sign: 'abc123', sign_type: 'RSA2', out_trade_no: 'ZFB_123', total_amount: '100.00' },
      'public_key',
    )).toBe(true);
  });

  it('returns false when only sign and sign_type present (no other params)', () => {
    expect(verifyAlipaySignature({ sign: 'abc', sign_type: 'RSA2' }, 'public_key')).toBe(false);
  });
});

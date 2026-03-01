import { describe, it, expect } from 'vitest';
import {
  validateBalance,
  validateWithdrawalAmount,
  validateWithdrawalMethod,
  validateWithdrawalAccount,
  calculateWithdrawalFee,
  getEstimatedProcessingDays,
  buildWithdrawalRequest,
  getWithdrawalMethodLabel,
  getWithdrawalStatusLabel,
  formatWithdrawalAmount,
  MIN_WITHDRAWAL_AMOUNT,
  MAX_WITHDRAWAL_AMOUNT,
  WITHDRAWAL_FEE_RATES,
} from './withdrawal';
import type { WithdrawalMethod } from './withdrawal';

// --- validateBalance ---

describe('validateBalance', () => {
  it('accepts balance >= 10', () => {
    expect(validateBalance(10).valid).toBe(true);
    expect(validateBalance(100).valid).toBe(true);
    expect(validateBalance(10.01).valid).toBe(true);
  });

  it('rejects balance < 10', () => {
    const result = validateBalance(9.99);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain(`${MIN_WITHDRAWAL_AMOUNT}`);
  });

  it('rejects zero balance', () => {
    expect(validateBalance(0).valid).toBe(false);
  });

  it('rejects negative balance', () => {
    expect(validateBalance(-5).valid).toBe(false);
  });

  it('rejects NaN', () => {
    expect(validateBalance(NaN).valid).toBe(false);
  });

  it('rejects Infinity', () => {
    expect(validateBalance(Infinity).valid).toBe(false);
  });
});

// --- validateWithdrawalAmount ---

describe('validateWithdrawalAmount', () => {
  it('accepts valid amount within balance', () => {
    expect(validateWithdrawalAmount(10, 100).valid).toBe(true);
    expect(validateWithdrawalAmount(50, 50).valid).toBe(true);
  });

  it('rejects amount below minimum', () => {
    const result = validateWithdrawalAmount(5, 100);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain(`${MIN_WITHDRAWAL_AMOUNT}`);
  });

  it('rejects amount above maximum', () => {
    const result = validateWithdrawalAmount(MAX_WITHDRAWAL_AMOUNT + 1, 10000);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain(`${MAX_WITHDRAWAL_AMOUNT}`);
  });

  it('rejects amount exceeding balance', () => {
    const result = validateWithdrawalAmount(100, 50);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('余额');
  });

  it('rejects NaN amount', () => {
    expect(validateWithdrawalAmount(NaN, 100).valid).toBe(false);
  });

  it('rejects Infinity amount', () => {
    expect(validateWithdrawalAmount(Infinity, 100).valid).toBe(false);
  });

  it('rejects NaN balance', () => {
    expect(validateWithdrawalAmount(10, NaN).valid).toBe(false);
  });
});

// --- validateWithdrawalMethod ---

describe('validateWithdrawalMethod', () => {
  it('accepts wechat', () => {
    expect(validateWithdrawalMethod('wechat').valid).toBe(true);
  });

  it('accepts alipay', () => {
    expect(validateWithdrawalMethod('alipay').valid).toBe(true);
  });

  it('accepts bank_card', () => {
    expect(validateWithdrawalMethod('bank_card').valid).toBe(true);
  });

  it('rejects unknown method', () => {
    const result = validateWithdrawalMethod('bitcoin');
    expect(result.valid).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateWithdrawalMethod('').valid).toBe(false);
  });
});

// --- validateWithdrawalAccount ---

describe('validateWithdrawalAccount', () => {
  it('accepts non-empty account for wechat', () => {
    expect(validateWithdrawalAccount('wx_user_123', 'wechat').valid).toBe(true);
  });

  it('accepts non-empty account for alipay', () => {
    expect(validateWithdrawalAccount('user@example.com', 'alipay').valid).toBe(true);
  });

  it('accepts valid bank card number', () => {
    expect(validateWithdrawalAccount('6222021234567890123', 'bank_card').valid).toBe(true);
  });

  it('rejects empty account', () => {
    expect(validateWithdrawalAccount('', 'wechat').valid).toBe(false);
  });

  it('rejects whitespace-only account', () => {
    expect(validateWithdrawalAccount('   ', 'alipay').valid).toBe(false);
  });

  it('rejects short bank card number', () => {
    const result = validateWithdrawalAccount('12345', 'bank_card');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('银行卡号');
  });
});

// --- calculateWithdrawalFee ---

describe('calculateWithdrawalFee', () => {
  it('returns zero fee for wechat', () => {
    const result = calculateWithdrawalFee(100, 'wechat');
    expect(result.fee).toBe(0);
    expect(result.netAmount).toBe(100);
    expect(result.feeRate).toBe(0);
  });

  it('returns zero fee for alipay', () => {
    const result = calculateWithdrawalFee(100, 'alipay');
    expect(result.fee).toBe(0);
    expect(result.netAmount).toBe(100);
  });

  it('calculates 1% fee for bank card', () => {
    const result = calculateWithdrawalFee(100, 'bank_card');
    expect(result.fee).toBe(1);
    expect(result.netAmount).toBe(99);
    expect(result.feeRate).toBe(WITHDRAWAL_FEE_RATES.bank_card);
  });

  it('rounds fee to 2 decimal places', () => {
    const result = calculateWithdrawalFee(33.33, 'bank_card');
    expect(result.fee).toBe(0.33);
    expect(result.netAmount).toBe(33);
  });
});

// --- getEstimatedProcessingDays ---

describe('getEstimatedProcessingDays', () => {
  it('returns 1 day for wechat', () => {
    const days = getEstimatedProcessingDays('wechat');
    expect(days.min).toBe(1);
    expect(days.max).toBe(1);
  });

  it('returns 1 day for alipay', () => {
    const days = getEstimatedProcessingDays('alipay');
    expect(days.min).toBe(1);
    expect(days.max).toBe(1);
  });

  it('returns 1-3 days for bank card', () => {
    const days = getEstimatedProcessingDays('bank_card');
    expect(days.min).toBe(1);
    expect(days.max).toBe(3);
  });
});

// --- buildWithdrawalRequest ---

describe('buildWithdrawalRequest', () => {
  it('builds valid wechat withdrawal', () => {
    const result = buildWithdrawalRequest({
      amount: 50,
      balance: 100,
      method: 'wechat',
      account: 'wx_user_123',
    });
    expect(result.valid).toBe(true);
    expect(result.amount).toBe(50);
    expect(result.fee).toBe(0);
    expect(result.netAmount).toBe(50);
    expect(result.method).toBe('wechat');
  });

  it('builds valid bank card withdrawal with fee', () => {
    const result = buildWithdrawalRequest({
      amount: 100,
      balance: 200,
      method: 'bank_card',
      account: '6222021234567890123',
    });
    expect(result.valid).toBe(true);
    expect(result.fee).toBe(1);
    expect(result.netAmount).toBe(99);
    expect(result.estimatedDays.max).toBe(3);
  });

  it('rejects insufficient balance', () => {
    const result = buildWithdrawalRequest({
      amount: 100,
      balance: 5,
      method: 'wechat',
      account: 'wx_user_123',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects invalid method', () => {
    const result = buildWithdrawalRequest({
      amount: 50,
      balance: 100,
      method: 'bitcoin' as unknown as WithdrawalMethod,
      account: 'addr_123',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects empty account', () => {
    const result = buildWithdrawalRequest({
      amount: 50,
      balance: 100,
      method: 'alipay',
      account: '',
    });
    expect(result.valid).toBe(false);
  });
});

// --- getWithdrawalMethodLabel ---

describe('getWithdrawalMethodLabel', () => {
  it('returns 微信 for wechat', () => {
    expect(getWithdrawalMethodLabel('wechat')).toBe('微信');
  });

  it('returns 支付宝 for alipay', () => {
    expect(getWithdrawalMethodLabel('alipay')).toBe('支付宝');
  });

  it('returns 银行卡 for bank_card', () => {
    expect(getWithdrawalMethodLabel('bank_card')).toBe('银行卡');
  });
});

// --- getWithdrawalStatusLabel ---

describe('getWithdrawalStatusLabel', () => {
  it('returns correct labels for all statuses', () => {
    expect(getWithdrawalStatusLabel('pending')).toBe('处理中');
    expect(getWithdrawalStatusLabel('processing')).toBe('转账中');
    expect(getWithdrawalStatusLabel('completed')).toBe('已到账');
    expect(getWithdrawalStatusLabel('failed')).toBe('提现失败');
  });
});

// --- formatWithdrawalAmount ---

describe('formatWithdrawalAmount', () => {
  it('formats with ¥ prefix and 2 decimals', () => {
    expect(formatWithdrawalAmount(100)).toBe('¥100.00');
    expect(formatWithdrawalAmount(29.9)).toBe('¥29.90');
    expect(formatWithdrawalAmount(0)).toBe('¥0.00');
    expect(formatWithdrawalAmount(10.5)).toBe('¥10.50');
  });
});

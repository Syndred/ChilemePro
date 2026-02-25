/**
 * Pure withdrawal business logic — no side effects, fully testable.
 *
 * Requirement 13.1: Display withdrawable balance
 * Requirement 13.2: Validate balance is sufficient
 * Requirement 13.3: Allow withdrawal when balance >= 10
 * Requirement 13.4: Reject withdrawal when balance < 10
 * Requirement 13.5: Process withdrawal via payment channel
 * Requirement 13.6: Support WeChat, Alipay, bank card
 * Requirement 13.7: Record withdrawal history (amount, fee, arrival time)
 * Requirement 13.8: Display withdrawal fee clearly
 * Requirement 13.9: Complete withdrawal within 1-3 business days
 */

import type { TransactionStatus } from '@/types';

// --- Constants ---

/** Minimum withdrawal amount (CNY) */
export const MIN_WITHDRAWAL_AMOUNT = 10;

/** Maximum single withdrawal amount (CNY) */
export const MAX_WITHDRAWAL_AMOUNT = 5000;

/** Withdrawal fee rates by method */
export const WITHDRAWAL_FEE_RATES: Record<WithdrawalMethod, number> = {
  wechat: 0,
  alipay: 0,
  bank_card: 0.01,
} as const;

/** Estimated processing days by method */
export const PROCESSING_DAYS: Record<WithdrawalMethod, { min: number; max: number }> = {
  wechat: { min: 1, max: 1 },
  alipay: { min: 1, max: 1 },
  bank_card: { min: 1, max: 3 },
} as const;

/** Supported withdrawal methods */
export const WITHDRAWAL_METHODS = ['wechat', 'alipay', 'bank_card'] as const;

// --- Types ---

export type WithdrawalMethod = 'wechat' | 'alipay' | 'bank_card';

export interface WithdrawalValidation {
  valid: boolean;
  reason?: string;
}

export interface WithdrawalFeeResult {
  fee: number;
  netAmount: number;
  feeRate: number;
}

export interface WithdrawalRequest {
  amount: number;
  balance: number;
  method: WithdrawalMethod;
  account: string;
}

export interface WithdrawalResult {
  valid: boolean;
  amount: number;
  fee: number;
  netAmount: number;
  method: WithdrawalMethod;
  estimatedDays: { min: number; max: number };
  error?: string;
}

// --- Pure Functions ---

/**
 * Validate that the user's balance meets the minimum withdrawal threshold.
 * Requirement 13.3: Allow when balance >= 10
 * Requirement 13.4: Reject when balance < 10
 */
export function validateBalance(balance: number): WithdrawalValidation {
  if (!Number.isFinite(balance) || Number.isNaN(balance)) {
    return { valid: false, reason: '余额数据无效' };
  }

  if (balance < MIN_WITHDRAWAL_AMOUNT) {
    return {
      valid: false,
      reason: `余额不足，最低提现金额为 ${MIN_WITHDRAWAL_AMOUNT} 元`,
    };
  }

  return { valid: true };
}

/**
 * Validate a withdrawal amount against balance and limits.
 * Requirement 13.2: Verify balance is sufficient
 */
export function validateWithdrawalAmount(
  amount: number,
  balance: number,
): WithdrawalValidation {
  if (!Number.isFinite(amount) || Number.isNaN(amount)) {
    return { valid: false, reason: '提现金额无效' };
  }

  if (amount < MIN_WITHDRAWAL_AMOUNT) {
    return {
      valid: false,
      reason: `最低提现金额为 ${MIN_WITHDRAWAL_AMOUNT} 元`,
    };
  }

  if (amount > MAX_WITHDRAWAL_AMOUNT) {
    return {
      valid: false,
      reason: `单笔提现不能超过 ${MAX_WITHDRAWAL_AMOUNT} 元`,
    };
  }

  if (!Number.isFinite(balance) || Number.isNaN(balance)) {
    return { valid: false, reason: '余额数据无效' };
  }

  if (amount > balance) {
    return { valid: false, reason: '提现金额不能超过可用余额' };
  }

  return { valid: true };
}

/**
 * Validate the withdrawal method.
 * Requirement 13.6: Support WeChat, Alipay, bank card
 */
export function validateWithdrawalMethod(method: string): WithdrawalValidation {
  if (!WITHDRAWAL_METHODS.includes(method as WithdrawalMethod)) {
    return {
      valid: false,
      reason: `不支持的提现方式，请选择: 微信、支付宝或银行卡`,
    };
  }

  return { valid: true };
}

/**
 * Validate the withdrawal account identifier.
 */
export function validateWithdrawalAccount(
  account: string,
  method: WithdrawalMethod,
): WithdrawalValidation {
  if (!account || account.trim().length === 0) {
    return { valid: false, reason: '请输入提现账户信息' };
  }

  if (method === 'bank_card' && account.trim().length < 10) {
    return { valid: false, reason: '银行卡号格式不正确' };
  }

  return { valid: true };
}

/**
 * Calculate the withdrawal fee and net amount.
 * Requirement 13.8: Display withdrawal fee clearly
 */
export function calculateWithdrawalFee(
  amount: number,
  method: WithdrawalMethod,
): WithdrawalFeeResult {
  const feeRate = WITHDRAWAL_FEE_RATES[method];
  const fee = Math.round(amount * feeRate * 100) / 100;
  const netAmount = Math.round((amount - fee) * 100) / 100;

  return { fee, netAmount, feeRate };
}

/**
 * Get estimated processing time for a withdrawal method.
 * Requirement 13.9: Complete within 1-3 business days
 */
export function getEstimatedProcessingDays(
  method: WithdrawalMethod,
): { min: number; max: number } {
  return PROCESSING_DAYS[method];
}

/**
 * Build and validate a complete withdrawal request.
 * Combines all validations and returns a structured result.
 */
export function buildWithdrawalRequest(input: WithdrawalRequest): WithdrawalResult {
  // Validate method
  const methodValidation = validateWithdrawalMethod(input.method);
  if (!methodValidation.valid) {
    return {
      valid: false,
      amount: 0,
      fee: 0,
      netAmount: 0,
      method: input.method,
      estimatedDays: { min: 0, max: 0 },
      error: methodValidation.reason,
    };
  }

  // Validate amount against balance
  const amountValidation = validateWithdrawalAmount(input.amount, input.balance);
  if (!amountValidation.valid) {
    return {
      valid: false,
      amount: 0,
      fee: 0,
      netAmount: 0,
      method: input.method,
      estimatedDays: { min: 0, max: 0 },
      error: amountValidation.reason,
    };
  }

  // Validate account
  const accountValidation = validateWithdrawalAccount(input.account, input.method);
  if (!accountValidation.valid) {
    return {
      valid: false,
      amount: 0,
      fee: 0,
      netAmount: 0,
      method: input.method,
      estimatedDays: { min: 0, max: 0 },
      error: accountValidation.reason,
    };
  }

  // Calculate fee
  const { fee, netAmount } = calculateWithdrawalFee(input.amount, input.method);
  const estimatedDays = getEstimatedProcessingDays(input.method);

  return {
    valid: true,
    amount: input.amount,
    fee,
    netAmount,
    method: input.method,
    estimatedDays,
  };
}

/**
 * Get a human-readable label for a withdrawal method.
 */
export function getWithdrawalMethodLabel(method: WithdrawalMethod): string {
  switch (method) {
    case 'wechat':
      return '微信';
    case 'alipay':
      return '支付宝';
    case 'bank_card':
      return '银行卡';
    default:
      return '未知';
  }
}

/**
 * Get a human-readable label for a transaction status.
 */
export function getWithdrawalStatusLabel(status: TransactionStatus): string {
  switch (status) {
    case 'pending':
      return '处理中';
    case 'processing':
      return '转账中';
    case 'completed':
      return '已到账';
    case 'failed':
      return '提现失败';
    default:
      return '未知';
  }
}

/**
 * Format a withdrawal amount for display with ¥ prefix.
 */
export function formatWithdrawalAmount(amount: number): string {
  return `¥${amount.toFixed(2)}`;
}

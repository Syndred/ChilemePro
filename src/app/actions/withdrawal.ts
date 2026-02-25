'use server';

import { createClient } from '@/lib/supabase/server';
import {
  validateBalance,
  validateWithdrawalAmount,
  validateWithdrawalMethod,
  validateWithdrawalAccount,
  calculateWithdrawalFee,
  getEstimatedProcessingDays,
  type WithdrawalMethod,
} from '@/lib/utils/withdrawal';
import type { RewardTransaction, TransactionStatus } from '@/types';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// --- Mapper ---

function mapRewardTransaction(row: Record<string, unknown>): RewardTransaction {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    challengeId: (row.challenge_id as string) ?? null,
    type: row.type as RewardTransaction['type'],
    amount: Number(row.amount),
    balanceAfter: Number(row.balance_after),
    status: row.status as TransactionStatus,
    paymentMethod: (row.payment_method as RewardTransaction['paymentMethod']) ?? null,
    paymentAccount: (row.payment_account as string) ?? null,
    processedAt: row.processed_at ? new Date(row.processed_at as string) : null,
    createdAt: new Date(row.created_at as string),
  };
}

/**
 * Get the current user's reward balance.
 * Requirement 13.1: Display withdrawable balance
 */
export async function getRewardBalance(): Promise<ActionResult<{ balance: number }>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // Get the latest reward transaction to read balance_after
    const { data: latestTx } = await supabase
      .from('reward_transactions')
      .select('balance_after')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const balance = Number(latestTx?.balance_after ?? 0);

    return { success: true, data: { balance } };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}


/**
 * Get the current user's reward transaction history.
 * Requirement 13.7: Record all withdrawal history
 */
export async function getRewardHistory(): Promise<ActionResult<RewardTransaction[]>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { data: rows, error } = await supabase
      .from('reward_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: '查询奖励记录失败' };
    }

    const transactions = (rows ?? []).map((row) =>
      mapRewardTransaction(row as Record<string, unknown>),
    );

    return { success: true, data: transactions };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Submit a withdrawal request.
 * Requirement 13.2: Validate balance is sufficient
 * Requirement 13.3: Allow when balance >= 10
 * Requirement 13.4: Reject when balance < 10
 * Requirement 13.5: Process via payment channel
 * Requirement 13.6: Support WeChat, Alipay, bank card
 * Requirement 13.7: Record withdrawal history
 */
export async function requestWithdrawal(input: {
  amount: number;
  method: string;
  account: string;
}): Promise<ActionResult<RewardTransaction>> {
  // Validate method
  const methodCheck = validateWithdrawalMethod(input.method);
  if (!methodCheck.valid) {
    return { success: false, error: methodCheck.reason };
  }

  const method = input.method as WithdrawalMethod;

  // Validate account
  const accountCheck = validateWithdrawalAccount(input.account, method);
  if (!accountCheck.valid) {
    return { success: false, error: accountCheck.reason };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // Get current balance
    const { data: latestTx } = await supabase
      .from('reward_transactions')
      .select('balance_after')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const balance = Number(latestTx?.balance_after ?? 0);

    // Validate balance threshold
    const balanceCheck = validateBalance(balance);
    if (!balanceCheck.valid) {
      return { success: false, error: balanceCheck.reason };
    }

    // Validate amount against balance
    const amountCheck = validateWithdrawalAmount(input.amount, balance);
    if (!amountCheck.valid) {
      return { success: false, error: amountCheck.reason };
    }

    // Calculate fee
    const { fee, netAmount } = calculateWithdrawalFee(input.amount, method);
    const estimatedDays = getEstimatedProcessingDays(method);

    // Create withdrawal transaction (negative amount for withdrawal)
    const newBalance = Math.round((balance - input.amount) * 100) / 100;

    const { data: row, error } = await supabase
      .from('reward_transactions')
      .insert({
        user_id: user.id,
        type: 'withdrawal',
        amount: -input.amount,
        balance_after: newBalance,
        status: 'pending',
        payment_method: method === 'bank_card' ? 'stripe' : method,
        payment_account: input.account,
      })
      .select()
      .single();

    if (error || !row) {
      return { success: false, error: '提现申请失败，请重试' };
    }

    return {
      success: true,
      data: mapRewardTransaction(row as Record<string, unknown>),
    };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

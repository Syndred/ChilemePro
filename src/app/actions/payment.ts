'use server';

import { createClient } from '@/lib/supabase/server';
import {
  validatePaymentAmount,
  canRetryPayment,
} from '@/lib/utils/payment';
import type { PaymentTransaction, PaymentTransactionType, TransactionStatus } from '@/types';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// --- Mapper ---

function mapPaymentTransaction(row: Record<string, unknown>): PaymentTransaction {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    challengeId: (row.challenge_id as string) ?? null,
    type: row.type as PaymentTransactionType,
    amount: Number(row.amount),
    paymentMethod: row.payment_method as PaymentTransaction['paymentMethod'],
    paymentProvider: row.payment_provider as PaymentTransaction['paymentProvider'],
    transactionId: row.transaction_id as string,
    status: row.status as TransactionStatus,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/**
 * Get payment history for the current user.
 * Requirement 18.6: Record all payment and withdrawal transactions.
 */
export async function getPaymentHistory(): Promise<ActionResult<PaymentTransaction[]>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { data: rows, error } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: '查询支付记录失败' };
    }

    const transactions = (rows ?? []).map((row) =>
      mapPaymentTransaction(row as Record<string, unknown>),
    );

    return { success: true, data: transactions };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Get a specific payment transaction by ID.
 */
export async function getPaymentTransaction(
  transactionId: string,
): Promise<ActionResult<PaymentTransaction>> {
  if (!transactionId) {
    return { success: false, error: '交易 ID 不能为空' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { data: row, error } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('transaction_id', transactionId)
      .eq('user_id', user.id)
      .single();

    if (error || !row) {
      return { success: false, error: '交易记录不存在' };
    }

    return {
      success: true,
      data: mapPaymentTransaction(row as Record<string, unknown>),
    };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Validate a payment request before initiating.
 * Used by the client to pre-validate before calling the Stripe API route.
 * Requirement 18.4: Validate and show errors before payment.
 */
export async function validatePayment(
  type: PaymentTransactionType,
  amount: number,
): Promise<ActionResult<{ valid: boolean }>> {
  const validation = validatePaymentAmount(amount, type);
  if (!validation.valid) {
    return { success: false, error: validation.reason };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // For deposits, check if user already has an active/pending challenge
    if (type === 'deposit') {
      const { data: existingChallenges } = await supabase
        .from('challenges')
        .select('status')
        .eq('user_id', user.id)
        .in('status', ['active', 'pending']);

      if (existingChallenges && existingChallenges.length > 0) {
        return { success: false, error: '您已有进行中的挑战，无法重复支付押金' };
      }
    }

    return { success: true, data: { valid: true } };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

/**
 * Check if a failed payment can be retried.
 * Requirement 18.4: Allow retry on payment failure.
 */
export async function checkPaymentRetry(
  transactionId: string,
): Promise<ActionResult<{ canRetry: boolean }>> {
  if (!transactionId) {
    return { success: false, error: '交易 ID 不能为空' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { data: row, error } = await supabase
      .from('payment_transactions')
      .select('status')
      .eq('transaction_id', transactionId)
      .eq('user_id', user.id)
      .single();

    if (error || !row) {
      return { success: false, error: '交易记录不存在' };
    }

    const retry = canRetryPayment(row.status as TransactionStatus);
    return { success: true, data: { canRetry: retry } };
  } catch {
    return { success: false, error: '服务器错误，请重试' };
  }
}

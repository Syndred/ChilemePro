import { z } from 'zod';

export const paymentMethodSchema = z.enum(['wechat', 'alipay', 'stripe']);

export const paymentProviderSchema = z.enum(['wechat', 'alipay', 'stripe']);

export const transactionStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
]);

// Requirements 13.3: minimum withdrawal 10 yuan
export const withdrawalSchema = z.object({
  amount: z.number().min(10, '最低提现金额为10元'),
  paymentMethod: paymentMethodSchema,
  paymentAccount: z.string().min(1, '提现账户不能为空'),
});

export type WithdrawalFormValues = z.infer<typeof withdrawalSchema>;

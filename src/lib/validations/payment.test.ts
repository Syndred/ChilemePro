import { describe, it, expect } from 'vitest';
import { withdrawalSchema } from './payment';

describe('withdrawalSchema', () => {
  it('accepts withdrawal of 10 yuan', () => {
    const result = withdrawalSchema.safeParse({
      amount: 10,
      paymentMethod: 'wechat',
      paymentAccount: 'user123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects withdrawal below 10 yuan', () => {
    const result = withdrawalSchema.safeParse({
      amount: 9.99,
      paymentMethod: 'alipay',
      paymentAccount: 'user123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty payment account', () => {
    const result = withdrawalSchema.safeParse({
      amount: 50,
      paymentMethod: 'stripe',
      paymentAccount: '',
    });
    expect(result.success).toBe(false);
  });
});

import { z } from 'zod';

export const phoneSchema = z
  .string()
  .regex(/^1[3-9]\d{9}$/, '请输入有效的中国大陆手机号');

export const verificationCodeSchema = z
  .string()
  .length(6, '验证码必须为 6 位数字')
  .regex(/^\d{6}$/, '验证码必须为 6 位数字');

export const sendCodeSchema = z.object({
  phone: phoneSchema,
});

export const verifyCodeSchema = z.object({
  phone: phoneSchema,
  code: verificationCodeSchema,
});

export type SendCodeFormValues = z.infer<typeof sendCodeSchema>;
export type VerifyCodeFormValues = z.infer<typeof verifyCodeSchema>;

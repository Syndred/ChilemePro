import { z } from 'zod';
import { genderSchema, activityLevelSchema } from './user';

/**
 * Validation schema for the onboarding form.
 * Requirements 2.4: height 100-250cm
 * Requirements 2.5: weight 30-300kg
 * Requirements 2.6: age 10-120
 */
export const onboardingSchema = z.object({
  height: z
    .number()
    .min(100, '身高不能低于100厘米')
    .max(250, '身高不能超过250厘米'),
  weight: z
    .number()
    .min(30, '体重不能低于30公斤')
    .max(300, '体重不能超过300公斤'),
  targetWeight: z
    .number()
    .min(30, '目标体重不能低于30公斤')
    .max(300, '目标体重不能超过300公斤'),
  age: z
    .number()
    .int('年龄必须是整数')
    .min(10, '年龄不能低于10岁')
    .max(120, '年龄不能超过120岁'),
  gender: genderSchema,
  activityLevel: activityLevelSchema,
});

export type OnboardingFormValues = z.infer<typeof onboardingSchema>;

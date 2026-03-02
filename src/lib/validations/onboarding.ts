import { z } from 'zod';
import { genderSchema, activityLevelSchema } from './user';
import { numericRangeField } from './number';

/**
 * Validation schema for the onboarding form.
 * Requirements 2.4: height 100-250cm
 * Requirements 2.5: weight 30-300kg
 * Requirements 2.6: age 10-120
 */
export const onboardingSchema = z.object({
  height: numericRangeField({
    label: '身高',
    min: 100,
    max: 250,
    minMessage: '身高不能低于100厘米',
    maxMessage: '身高不能超过250厘米',
  }),
  weight: numericRangeField({
    label: '体重',
    min: 30,
    max: 300,
    minMessage: '体重不能低于30公斤',
    maxMessage: '体重不能超过300公斤',
  }),
  targetWeight: numericRangeField({
    label: '目标体重',
    min: 30,
    max: 300,
    minMessage: '目标体重不能低于30公斤',
    maxMessage: '目标体重不能超过300公斤',
  }),
  age: numericRangeField({
    label: '年龄',
    min: 10,
    max: 120,
    integer: true,
    minMessage: '年龄不能低于10岁',
    maxMessage: '年龄不能超过120岁',
    integerMessage: '年龄必须是整数',
  }),
  gender: genderSchema,
  activityLevel: activityLevelSchema,
});

export type OnboardingFormValues = z.infer<typeof onboardingSchema>;

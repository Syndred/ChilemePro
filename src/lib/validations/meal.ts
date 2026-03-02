import { z } from 'zod';

export const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);

const dataUrlImageRegex = /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/;

const imageUrlSchema = z.string().refine(
  (value) => {
    if (value.startsWith('data:image/')) {
      return dataUrlImageRegex.test(value);
    }

    return z.string().url().safeParse(value).success;
  },
  {
    message: '图片地址格式不正确',
  },
);

export const foodItemSchema = z.object({
  name: z.string().min(1, '食物名称不能为空').max(100, '食物名称最多100个字符'),
  calories: z.number().min(0, '热量不能为负数'),
  protein: z.number().min(0, '蛋白质不能为负数'),
  fat: z.number().min(0, '脂肪不能为负数'),
  carbs: z.number().min(0, '碳水化合物不能为负数'),
  serving: z.number().positive('份量必须大于0'),
  unit: z.string().min(1, '单位不能为空').max(20),
});

export const createMealRecordSchema = z.object({
  mealType: mealTypeSchema,
  foods: z.array(foodItemSchema).min(1, '至少添加一种食物'),
  imageUrl: imageUrlSchema.optional(),
  recordedAt: z.coerce.date(),
});

export const updateMealRecordSchema = z.object({
  mealType: mealTypeSchema.optional(),
  foods: z.array(foodItemSchema).min(1, '至少添加一种食物').optional(),
  imageUrl: imageUrlSchema.nullable().optional(),
});

export type FoodItemFormValues = z.infer<typeof foodItemSchema>;
export type CreateMealRecordFormValues = z.infer<typeof createMealRecordSchema>;
export type UpdateMealRecordFormValues = z.infer<typeof updateMealRecordSchema>;

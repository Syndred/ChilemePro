import { z } from 'zod';

export const challengeStatusSchema = z.enum([
  'pending',
  'active',
  'completed',
  'failed',
]);

export const joinChallengeSchema = z.object({
  deposit: z.number().positive('押金必须大于0'),
});

export const dailyTaskSchema = z.object({
  challengeId: z.string().uuid(),
  day: z.number().int().min(1).max(7),
  taskDate: z.coerce.date(),
  completed: z.boolean().default(false),
  reward: z.number().min(0),
  mealRecorded: z.boolean().default(false),
  calorieTargetMet: z.boolean().default(false),
  exerciseTargetMet: z.boolean().nullable().default(null),
});

export type JoinChallengeFormValues = z.infer<typeof joinChallengeSchema>;

'use client';

import { useState, useTransition, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { getProfileSummary, updateProfile } from '@/app/actions/profile';
import { calculateDailyCalories } from '@/lib/utils/calorie';
import type { Gender, ActivityLevel } from '@/types';

const editProfileSchema = z.object({
  nickname: z
    .string()
    .min(1, '昵称不能为空')
    .max(20, '昵称不能超过20个字符'),
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
  gender: z.enum(['male', 'female', 'other']),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
});

type EditProfileFormValues = z.infer<typeof editProfileSchema>;

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'other', label: '其他' },
];

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; desc: string }[] = [
  { value: 'sedentary', label: '久坐', desc: '几乎不运动' },
  { value: 'light', label: '轻度活动', desc: '每周运动1-3天' },
  { value: 'moderate', label: '中度活动', desc: '每周运动3-5天' },
  { value: 'active', label: '高度活动', desc: '每周运动6-7天' },
  { value: 'very_active', label: '极高活动', desc: '高强度训练或体力劳动' },
];

/**
 * Edit profile page.
 * Requirement 16.1: Edit personal info (nickname, avatar, basic info)
 * Requirement 2.2: Recalculate daily calories when info changes
 */
export default function EditProfilePage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [caloriePreview, setCaloriePreview] = useState<number | null>(null);

  const form = useForm<EditProfileFormValues>({
    resolver: zodResolver(editProfileSchema),
    defaultValues: {
      nickname: '',
      height: undefined,
      weight: undefined,
      targetWeight: undefined,
      age: undefined,
      gender: 'male',
      activityLevel: 'moderate',
    },
  });

  // Load existing profile data
  useEffect(() => {
    async function loadProfile() {
      const result = await getProfileSummary();
      if (result.success && result.data) {
        const p = result.data;
        form.reset({
          nickname: p.nickname,
          height: p.height || undefined,
          weight: p.weight || undefined,
          targetWeight: p.targetWeight || undefined,
          age: p.age || undefined,
          gender: p.gender,
          activityLevel: p.activityLevel,
        });
        if (p.dailyCalorieTarget) {
          setCaloriePreview(p.dailyCalorieTarget);
        }
      }
      setLoading(false);
    }
    loadProfile();
  }, [form]);

  const updateCaloriePreview = useCallback(() => {
    const { gender, weight, height, age, activityLevel } = form.getValues();
    if (gender && weight && height && age && activityLevel) {
      const w = Number(weight);
      const h = Number(height);
      const a = Number(age);
      if (w > 0 && h > 0 && a > 0) {
        const cal = calculateDailyCalories({ gender, weight: w, height: h, age: a, activityLevel });
        setCaloriePreview(cal);
        return;
      }
    }
    setCaloriePreview(null);
  }, [form]);

  const onSubmit = useCallback(
    (data: EditProfileFormValues) => {
      setServerError(null);
      startTransition(async () => {
        const result = await updateProfile(data);
        if (result.success) {
          router.push('/profile');
        } else {
          setServerError(result.error ?? '保存失败，请重试');
        }
      });
    },
    [router],
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="返回">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">编辑资料</h1>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <CardContent className="pt-6">
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-5"
              noValidate
              onChange={updateCaloriePreview}
            >
              {/* Nickname */}
              <div className="space-y-2">
                <Label htmlFor="nickname">昵称</Label>
                <Input
                  id="nickname"
                  placeholder="输入昵称"
                  aria-describedby="nickname-error"
                  {...form.register('nickname')}
                />
                {form.formState.errors.nickname && (
                  <p id="nickname-error" className="text-sm text-destructive" role="alert">
                    {form.formState.errors.nickname.message}
                  </p>
                )}
              </div>

              {/* Gender */}
              <div className="space-y-2">
                <Label>性别</Label>
                <RadioGroup
                  value={form.watch('gender')}
                  onValueChange={(v) => {
                    form.setValue('gender', v as Gender, { shouldValidate: true });
                    updateCaloriePreview();
                  }}
                  className="flex gap-4"
                >
                  {GENDER_OPTIONS.map((opt) => (
                    <div key={opt.value} className="flex items-center space-x-2">
                      <RadioGroupItem value={opt.value} id={`edit-gender-${opt.value}`} />
                      <Label htmlFor={`edit-gender-${opt.value}`} className="cursor-pointer">
                        {opt.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {/* Height & Weight */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-height">身高 (cm)</Label>
                  <Input
                    id="edit-height"
                    type="number"
                    inputMode="decimal"
                    placeholder="170"
                    aria-describedby="edit-height-error"
                    {...form.register('height', { valueAsNumber: true })}
                    onChange={(e) => {
                      form.register('height', { valueAsNumber: true }).onChange(e);
                      updateCaloriePreview();
                    }}
                  />
                  {form.formState.errors.height && (
                    <p id="edit-height-error" className="text-sm text-destructive" role="alert">
                      {form.formState.errors.height.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-weight">体重 (kg)</Label>
                  <Input
                    id="edit-weight"
                    type="number"
                    inputMode="decimal"
                    placeholder="65"
                    aria-describedby="edit-weight-error"
                    {...form.register('weight', { valueAsNumber: true })}
                    onChange={(e) => {
                      form.register('weight', { valueAsNumber: true }).onChange(e);
                      updateCaloriePreview();
                    }}
                  />
                  {form.formState.errors.weight && (
                    <p id="edit-weight-error" className="text-sm text-destructive" role="alert">
                      {form.formState.errors.weight.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Target Weight & Age */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-targetWeight">目标体重 (kg)</Label>
                  <Input
                    id="edit-targetWeight"
                    type="number"
                    inputMode="decimal"
                    placeholder="60"
                    aria-describedby="edit-targetWeight-error"
                    {...form.register('targetWeight', { valueAsNumber: true })}
                  />
                  {form.formState.errors.targetWeight && (
                    <p id="edit-targetWeight-error" className="text-sm text-destructive" role="alert">
                      {form.formState.errors.targetWeight.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-age">年龄</Label>
                  <Input
                    id="edit-age"
                    type="number"
                    inputMode="numeric"
                    placeholder="25"
                    aria-describedby="edit-age-error"
                    {...form.register('age', { valueAsNumber: true })}
                    onChange={(e) => {
                      form.register('age', { valueAsNumber: true }).onChange(e);
                      updateCaloriePreview();
                    }}
                  />
                  {form.formState.errors.age && (
                    <p id="edit-age-error" className="text-sm text-destructive" role="alert">
                      {form.formState.errors.age.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Activity Level */}
              <div className="space-y-2">
                <Label htmlFor="edit-activityLevel">活动量</Label>
                <Select
                  value={form.watch('activityLevel')}
                  onValueChange={(v) => {
                    form.setValue('activityLevel', v as ActivityLevel, { shouldValidate: true });
                    updateCaloriePreview();
                  }}
                >
                  <SelectTrigger id="edit-activityLevel">
                    <SelectValue placeholder="选择活动量" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label} - {opt.desc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Calorie Preview */}
              {caloriePreview !== null && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-lg bg-primary/10 p-4 text-center"
                >
                  <p className="text-sm text-muted-foreground">每日推荐热量</p>
                  <p className="text-3xl font-bold text-primary">
                    {caloriePreview}
                    <span className="ml-1 text-base font-normal">kcal</span>
                  </p>
                </motion.div>
              )}

              {serverError && (
                <p className="text-sm text-destructive" role="alert">
                  {serverError}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                保存修改
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

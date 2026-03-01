'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
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
import { onboardingSchema, type OnboardingFormValues } from '@/lib/validations/onboarding';
import { calculateDailyCalories } from '@/lib/utils/calorie';
import { saveUserProfile } from '@/app/actions/user';
import type { Gender, ActivityLevel } from '@/types';

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

export default function OnboardingPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [caloriePreview, setCaloriePreview] = useState<number | null>(null);

  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      height: undefined,
      weight: undefined,
      targetWeight: undefined,
      age: undefined,
      gender: 'male',
      activityLevel: 'moderate',
    },
  });

  // Live calorie preview when all fields are filled
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
    (data: OnboardingFormValues) => {
      setServerError(null);
      const dailyCalorieTarget = calculateDailyCalories({
        gender: data.gender,
        weight: data.weight,
        height: data.height,
        age: data.age,
        activityLevel: data.activityLevel,
      });

      startTransition(async () => {
        const result = await saveUserProfile({
          ...data,
          dailyCalorieTarget,
        });
        if (result.success) {
          router.push('/');
        } else {
          setServerError(result.error ?? '保存失败，请重试');
        }
      });
    },
    [router],
  );

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-foreground">完善个人信息</h1>
          <p className="text-sm text-muted-foreground mt-1">
            帮助我们为你计算每日推荐热量
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-5"
              noValidate
              onChange={updateCaloriePreview}
            >
              {/* Gender */}
              <div className="space-y-2">
                <Label>性别</Label>
                <RadioGroup
                  defaultValue="male"
                  onValueChange={(v) => {
                    form.setValue('gender', v as Gender, { shouldValidate: true });
                    updateCaloriePreview();
                  }}
                  className="flex gap-4"
                >
                  {GENDER_OPTIONS.map((opt) => (
                    <div key={opt.value} className="flex items-center space-x-2">
                      <RadioGroupItem value={opt.value} id={`gender-${opt.value}`} />
                      <Label htmlFor={`gender-${opt.value}`} className="cursor-pointer">
                        {opt.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {form.formState.errors.gender && (
                  <p className="text-sm text-destructive" role="alert">
                    {form.formState.errors.gender.message}
                  </p>
                )}
              </div>

              {/* Height & Weight row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="height">身高 (cm)</Label>
                  <Input
                    id="height"
                    type="number"
                    inputMode="decimal"
                    placeholder="170"
                    aria-describedby="height-error"
                    {...form.register('height', { valueAsNumber: true })}
                    onChange={(e) => {
                      form.register('height', { valueAsNumber: true }).onChange(e);
                      updateCaloriePreview();
                    }}
                  />
                  {form.formState.errors.height && (
                    <p id="height-error" className="text-sm text-destructive" role="alert">
                      {form.formState.errors.height.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight">体重 (kg)</Label>
                  <Input
                    id="weight"
                    type="number"
                    inputMode="decimal"
                    placeholder="65"
                    aria-describedby="weight-error"
                    {...form.register('weight', { valueAsNumber: true })}
                    onChange={(e) => {
                      form.register('weight', { valueAsNumber: true }).onChange(e);
                      updateCaloriePreview();
                    }}
                  />
                  {form.formState.errors.weight && (
                    <p id="weight-error" className="text-sm text-destructive" role="alert">
                      {form.formState.errors.weight.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Target Weight & Age row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="targetWeight">目标体重 (kg)</Label>
                  <Input
                    id="targetWeight"
                    type="number"
                    inputMode="decimal"
                    placeholder="60"
                    aria-describedby="targetWeight-error"
                    {...form.register('targetWeight', { valueAsNumber: true })}
                  />
                  {form.formState.errors.targetWeight && (
                    <p id="targetWeight-error" className="text-sm text-destructive" role="alert">
                      {form.formState.errors.targetWeight.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="age">年龄</Label>
                  <Input
                    id="age"
                    type="number"
                    inputMode="numeric"
                    placeholder="25"
                    aria-describedby="age-error"
                    {...form.register('age', { valueAsNumber: true })}
                    onChange={(e) => {
                      form.register('age', { valueAsNumber: true }).onChange(e);
                      updateCaloriePreview();
                    }}
                  />
                  {form.formState.errors.age && (
                    <p id="age-error" className="text-sm text-destructive" role="alert">
                      {form.formState.errors.age.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Activity Level */}
              <div className="space-y-2">
                <Label htmlFor="activityLevel">活动量</Label>
                <Select
                  defaultValue="moderate"
                  onValueChange={(v) => {
                    form.setValue('activityLevel', v as ActivityLevel, { shouldValidate: true });
                    updateCaloriePreview();
                  }}
                >
                  <SelectTrigger id="activityLevel" aria-describedby="activityLevel-error">
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
                {form.formState.errors.activityLevel && (
                  <p id="activityLevel-error" className="text-sm text-destructive" role="alert">
                    {form.formState.errors.activityLevel.message}
                  </p>
                )}
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
                    <span className="text-base font-normal ml-1">kcal</span>
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
                {isPending && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                )}
                开始使用
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

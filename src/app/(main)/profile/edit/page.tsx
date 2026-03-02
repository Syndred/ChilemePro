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
import { NumberStepperField } from '@/components/form/NumberStepperField';
import { MainPageSkeleton } from '@/components/skeleton/PageSkeletons';
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
import { numericRangeField } from '@/lib/validations/number';
import type { Gender, ActivityLevel } from '@/types';

const editProfileSchema = z.object({
  nickname: z
    .string()
    .min(1, '昵称不能为空')
    .max(20, '昵称不能超过20个字符'),
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

const DEFAULT_PROFILE_VALUES = {
  height: 170,
  weight: 65,
  targetWeight: 60,
  age: 25,
} as const;

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
      height: DEFAULT_PROFILE_VALUES.height,
      weight: DEFAULT_PROFILE_VALUES.weight,
      targetWeight: DEFAULT_PROFILE_VALUES.targetWeight,
      age: DEFAULT_PROFILE_VALUES.age,
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
        const normalized = {
          height: p.height > 0 ? p.height : DEFAULT_PROFILE_VALUES.height,
          weight: p.weight > 0 ? p.weight : DEFAULT_PROFILE_VALUES.weight,
          targetWeight:
            p.targetWeight > 0 ? p.targetWeight : DEFAULT_PROFILE_VALUES.targetWeight,
          age: p.age > 0 ? p.age : DEFAULT_PROFILE_VALUES.age,
          gender: p.gender,
          activityLevel: p.activityLevel,
        };

        form.reset({
          nickname: p.nickname,
          height: normalized.height,
          weight: normalized.weight,
          targetWeight: normalized.targetWeight,
          age: normalized.age,
          gender: normalized.gender,
          activityLevel: normalized.activityLevel,
        });

        setCaloriePreview(
          calculateDailyCalories({
            gender: normalized.gender,
            weight: normalized.weight,
            height: normalized.height,
            age: normalized.age,
            activityLevel: normalized.activityLevel,
          }),
        );
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

  const handleNumericFieldChange = useCallback(
    (
      field: 'height' | 'weight' | 'targetWeight' | 'age',
      value: number | undefined,
    ) => {
      form.setValue(field, value as never, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      updateCaloriePreview();
    },
    [form, updateCaloriePreview],
  );

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
    return <MainPageSkeleton />;
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
                <NumberStepperField
                  id="edit-height"
                  label="身高"
                  unit="cm"
                  min={100}
                  max={250}
                  step={1}
                  placeholder="170"
                  value={form.watch('height')}
                  fallbackValue={DEFAULT_PROFILE_VALUES.height}
                  error={form.formState.errors.height?.message}
                  onChange={(value) => handleNumericFieldChange('height', value)}
                />
                <NumberStepperField
                  id="edit-weight"
                  label="体重"
                  unit="kg"
                  min={30}
                  max={300}
                  step={0.5}
                  placeholder="65"
                  value={form.watch('weight')}
                  fallbackValue={DEFAULT_PROFILE_VALUES.weight}
                  error={form.formState.errors.weight?.message}
                  onChange={(value) => handleNumericFieldChange('weight', value)}
                />
              </div>

              {/* Target Weight & Age */}
              <div className="grid grid-cols-2 gap-4">
                <NumberStepperField
                  id="edit-targetWeight"
                  label="目标体重"
                  unit="kg"
                  min={30}
                  max={300}
                  step={0.5}
                  placeholder="60"
                  value={form.watch('targetWeight')}
                  fallbackValue={DEFAULT_PROFILE_VALUES.targetWeight}
                  error={form.formState.errors.targetWeight?.message}
                  onChange={(value) => handleNumericFieldChange('targetWeight', value)}
                />
                <NumberStepperField
                  id="edit-age"
                  label="年龄"
                  min={10}
                  max={120}
                  step={1}
                  placeholder="25"
                  value={form.watch('age')}
                  fallbackValue={DEFAULT_PROFILE_VALUES.age}
                  error={form.formState.errors.age?.message}
                  onChange={(value) => handleNumericFieldChange('age', value)}
                />
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

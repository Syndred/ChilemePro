'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ImagePlus,
  Minus,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MainPageSkeleton } from '@/components/skeleton/PageSkeletons';
import { FoodSearch, type FoodSearchItem } from '@/components/meal/FoodSearch';
import { createMealRecord, getMealRecordById, updateMealRecord } from '@/app/actions/meal';
import { enqueueSync, cacheMealRecord } from '@/lib/offline/offline-store';
import { calculateFoodNutrition, calculateMealTotals } from '@/lib/utils/food-calorie';
import { clampNumber, parseOptionalNumber } from '@/lib/validations/number';
import type { MealType, RecognizedFood } from '@/types';

const MEAL_TYPES: { value: MealType; label: string; emoji: string }[] = [
  { value: 'breakfast', label: '早餐', emoji: '🥐' },
  { value: 'lunch', label: '午餐', emoji: '🍱' },
  { value: 'dinner', label: '晚餐', emoji: '🍲' },
  { value: 'snack', label: '加餐', emoji: '🍎' },
];

const MIN_SERVING = 1;
const MAX_SERVING = 5000;
const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

interface AddedFood {
  key: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  serving: number;
  unit: string;
}

function mapRecognizedFoodToAdded(food: RecognizedFood, index: number): AddedFood {
  return {
    key: `${food.name}-${Date.now()}-${index}`,
    name: food.name,
    calories: food.calories,
    protein: food.protein,
    fat: food.fat,
    carbs: food.carbs,
    serving: 100,
    unit: 'g',
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('failed_to_read_image'));
    reader.readAsDataURL(file);
  });
}

function formatImageSize(sizeInBytes: number): string {
  const mb = sizeInBytes / (1024 * 1024);
  return `${mb.toFixed(1)}MB`;
}

export default function AddMealPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const editId = searchParams.get('edit');

  const [mealType, setMealType] = useState<MealType>('lunch');
  const [foods, setFoods] = useState<AddedFood[]>([]);
  const [mealImage, setMealImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingRecord, setIsLoadingRecord] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const navigateToHomeWithFreshData = async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ['meals'] }),
      queryClient.invalidateQueries({ queryKey: ['calorieStats'] }),
    ]);
    router.replace('/');
    router.refresh();
  };

  useEffect(() => {
    if (editId) {
      return;
    }

    try {
      const raw = sessionStorage.getItem('ai-recognized-foods');
      if (!raw) {
        return;
      }

      const recognized = JSON.parse(raw) as RecognizedFood[];
      if (Array.isArray(recognized) && recognized.length > 0) {
        setFoods(recognized.map(mapRecognizedFoodToAdded));
      }

      sessionStorage.removeItem('ai-recognized-foods');
    } catch {
      // Ignore malformed cache
    }
  }, [editId]);

  useEffect(() => {
    if (!editId) {
      setEditingRecordId(null);
      setMealImage(null);
      return;
    }

    const targetEditId = editId;
    let cancelled = false;

    async function loadEditingRecord() {
      setIsLoadingRecord(true);
      const result = await getMealRecordById(targetEditId);

      if (cancelled) {
        return;
      }

      if (!result.success || !result.data) {
        setError(result.error ?? '加载记录失败，请稍后重试');
        setIsLoadingRecord(false);
        return;
      }

      const record = result.data;
      setEditingRecordId(record.id);
      setMealType(record.mealType);
      setMealImage(record.imageUrl ?? null);
      setFoods(
        record.foods.map((food, index) => ({
          key: `${food.id}-${index}`,
          name: food.name,
          calories: food.calories,
          protein: food.protein,
          fat: food.fat,
          carbs: food.carbs,
          serving: food.serving,
          unit: food.unit,
        })),
      );
      setError(null);
      setImageError(null);
      setIsLoadingRecord(false);
    }

    loadEditingRecord();

    return () => {
      cancelled = true;
    };
  }, [editId]);

  const handleFoodSelect = (food: FoodSearchItem) => {
    const nutrition = calculateFoodNutrition({
      caloriesPerServing: food.caloriesPerServing,
      proteinPerServing: food.proteinPerServing,
      fatPerServing: food.fatPerServing,
      carbsPerServing: food.carbsPerServing,
      quantity: food.defaultServing / 100,
    });

    setFoods((prev) => [
      ...prev,
      {
        key: `${food.name}-${Date.now()}`,
        name: food.name,
        calories: nutrition.calories,
        protein: nutrition.protein,
        fat: nutrition.fat,
        carbs: nutrition.carbs,
        serving: food.defaultServing,
        unit: food.unit,
      },
    ]);
    setError(null);
  };

  const normalizeServing = (value: number) =>
    Math.round(clampNumber(value, MIN_SERVING, MAX_SERVING));

  const handleServingChange = (index: number, nextServing: number | undefined) => {
    if (nextServing === undefined || !Number.isFinite(nextServing)) {
      return;
    }

    const newServing = normalizeServing(nextServing);
    setFoods((prev) =>
      prev.map((food, i) => {
        if (i !== index) {
          return food;
        }

        const previousServing = food.serving > 0 ? food.serving : 1;
        const ratio = newServing / previousServing;

        return {
          ...food,
          serving: newServing,
          calories: Math.round(food.calories * ratio * 100) / 100,
          protein: Math.round(food.protein * ratio * 100) / 100,
          fat: Math.round(food.fat * ratio * 100) / 100,
          carbs: Math.round(food.carbs * ratio * 100) / 100,
        };
      }),
    );
  };

  const adjustServing = (index: number, delta: number) => {
    const current = foods[index]?.serving ?? MIN_SERVING;
    handleServingChange(index, current + delta);
  };

  const handleRemoveFood = (index: number) => {
    setFoods((prev) => prev.filter((_, i) => i !== index));
  };

  const triggerImagePicker = () => {
    fileInputRef.current?.click();
  };

  const handleImageFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setImageError('仅支持图片文件，请选择 JPG、PNG 或 WebP 格式。');
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setImageError(
        `图片过大（${formatImageSize(file.size)}），请控制在 ${formatImageSize(MAX_IMAGE_SIZE_BYTES)} 以内。`,
      );
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (!dataUrl.startsWith('data:image/')) {
        setImageError('图片解析失败，请重新选择一张图片。');
        return;
      }
      setMealImage(dataUrl);
      setImageError(null);
    } catch {
      setImageError('图片读取失败，请稍后重试。');
    }
  };

  const handleRemoveImage = () => {
    setMealImage(null);
    setImageError(null);
  };

  const totals = calculateMealTotals(foods);

  const queueOfflineRecord = async () => {
    const recordId = `offline_${Date.now()}`;
    const payload = {
      mealType,
      foods: foods.map((food) => ({
        name: food.name,
        calories: food.calories,
        protein: food.protein,
        fat: food.fat,
        carbs: food.carbs,
        serving: food.serving,
        unit: food.unit,
      })),
      imageUrl: mealImage ?? undefined,
      recordedAt: new Date().toISOString(),
    };

    await enqueueSync({
      operation: 'create',
      tableName: 'meal_records',
      recordId,
      data: payload,
    });

    await cacheMealRecord({
      id: recordId,
      updated_at: new Date().toISOString(),
      meal_type: mealType,
      total_calories: totals.calories,
      total_protein: totals.protein,
      total_fat: totals.fat,
      total_carbs: totals.carbs,
      foods: payload.foods,
      image_url: mealImage,
      recorded_at: payload.recordedAt,
    });
  };

  const handleSubmit = async () => {
    if (foods.length === 0) {
      setError('请至少添加一种食物后再保存。');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const payload = {
      mealType,
      foods: foods.map((food) => ({
        name: food.name,
        calories: food.calories,
        protein: food.protein,
        fat: food.fat,
        carbs: food.carbs,
        serving: food.serving,
        unit: food.unit,
      })),
      imageUrl: mealImage ?? undefined,
      recordedAt: new Date(),
    };

    try {
      if (editingRecordId && !navigator.onLine) {
        setError('离线状态下暂不支持编辑记录，请联网后重试。');
        return;
      }

      if (!navigator.onLine) {
        await queueOfflineRecord();
        await navigateToHomeWithFreshData();
        return;
      }

      const result = editingRecordId
        ? await updateMealRecord(editingRecordId, {
            mealType,
            foods: payload.foods,
            imageUrl: mealImage ?? null,
          })
        : await createMealRecord(payload);

      if (result.success) {
        await navigateToHomeWithFreshData();
        return;
      }

      if (!navigator.onLine) {
        await queueOfflineRecord();
        await navigateToHomeWithFreshData();
        return;
      }

      setError(result.error ?? '保存失败，请稍后重试。');
    } catch {
      if (!navigator.onLine) {
        await queueOfflineRecord();
        await navigateToHomeWithFreshData();
        return;
      }

      setError('网络异常，请稍后重试。');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingRecord) {
    return <MainPageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pb-24 pt-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="返回">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold">
            {editingRecordId ? '编辑饮食记录' : '添加饮食记录'}
          </h1>
          <p className="text-xs text-muted-foreground">记录这一餐，让趋势更清晰。</p>
        </div>
      </div>

      <Card className="border-orange-200/60 bg-gradient-to-br from-orange-50 via-amber-50 to-white py-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">选择餐次</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="餐次选择">
            {MEAL_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                role="radio"
                aria-checked={mealType === type.value}
                onClick={() => setMealType(type.value)}
                className={`rounded-xl border px-2 py-3 text-center text-sm transition-colors ${
                  mealType === type.value
                    ? 'border-orange-300 bg-orange-100 text-orange-700'
                    : 'border-border bg-background hover:bg-accent'
                }`}
              >
                <div className="text-lg">{type.emoji}</div>
                <div>{type.label}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ImagePlus className="h-4 w-4 text-orange-500" />
            上传当餐图片（可选）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageFileChange}
          />

          {mealImage ? (
            <div className="overflow-hidden rounded-xl border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mealImage} alt="当餐图片预览" className="h-48 w-full object-cover" />
              <div className="flex items-center justify-end gap-2 bg-muted/40 p-2">
                <Button type="button" variant="outline" size="sm" onClick={triggerImagePicker}>
                  <Upload className="mr-1 h-4 w-4" />
                  更换图片
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleRemoveImage}>
                  <X className="mr-1 h-4 w-4" />
                  移除
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={triggerImagePicker}
              className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-orange-300 bg-orange-50/60 px-4 py-8 text-sm text-muted-foreground transition-colors hover:bg-orange-100/60"
            >
              <ImagePlus className="h-6 w-6 text-orange-500" />
              <span className="font-medium text-foreground">点击上传餐图</span>
              <span>后续可接入 AI 自动识别食物和营养分析</span>
            </button>
          )}

          {imageError && (
            <p className="text-sm text-destructive" role="alert">
              {imageError}
            </p>
          )}

          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            支持 JPG / PNG / WebP，大小不超过 8MB。
          </p>
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">添加食物</CardTitle>
        </CardHeader>
        <CardContent>
          <FoodSearch onSelect={handleFoodSelect} />
        </CardContent>
      </Card>

      {foods.length > 0 && (
        <Card className="py-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">已添加食物</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {foods.map((food, index) => (
              <div key={food.key} className="rounded-xl border bg-card p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{food.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {food.calories} 千卡 · 蛋白质 {food.protein}g · 脂肪 {food.fat}g · 碳水{' '}
                      {food.carbs}g
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleRemoveFood(index)}
                    aria-label={`删除${food.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">份量</Label>
                  <div className="flex items-center rounded-md border">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-r-none border-r"
                      onClick={() => adjustServing(index, -1)}
                      aria-label={`${food.name}份量减少`}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <Input
                      type="number"
                      min={MIN_SERVING}
                      max={MAX_SERVING}
                      step={1}
                      value={food.serving}
                      className="h-8 w-20 rounded-none border-0 px-1 text-center focus-visible:ring-0"
                      onChange={(e) =>
                        handleServingChange(index, parseOptionalNumber(e.target.value))
                      }
                      onBlur={(e) =>
                        handleServingChange(index, parseOptionalNumber(e.target.value))
                      }
                      aria-label={`${food.name}份量`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-l-none border-l"
                      onClick={() => adjustServing(index, 1)}
                      aria-label={`${food.name}份量增加`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground">{food.unit}</span>
                </div>
              </div>
            ))}

            <div className="rounded-lg border border-orange-100 bg-orange-50/70 p-3">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>本餐总计</span>
                <span className="text-orange-700">{totals.calories} 千卡</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-700">
                  蛋白质 {totals.protein}g
                </span>
                <span className="rounded-full bg-rose-100 px-2 py-1 text-rose-700">
                  脂肪 {totals.fat}g
                </span>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">
                  碳水 {totals.carbs}g
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="sticky bottom-3 bg-background/90 pb-2 pt-1 backdrop-blur">
        <Button
          className="h-11 w-full bg-orange-500 text-white hover:bg-orange-600 disabled:bg-orange-300"
          size="lg"
          onClick={handleSubmit}
          disabled={isSubmitting || foods.length === 0}
        >
          {isSubmitting
            ? editingRecordId
              ? '更新中...'
              : '保存中...'
            : editingRecordId
              ? '更新记录'
              : '保存记录'}
        </Button>
      </div>
    </div>
  );
}

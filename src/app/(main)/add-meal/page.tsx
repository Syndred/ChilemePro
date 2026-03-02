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
const MAX_MEAL_IMAGES = 3;
const MAX_COMPRESSED_IMAGE_BYTES = 550 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_MAX_EDGE = 1280;

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

function estimateDataUrlBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) {
    return dataUrl.length;
  }
  const base64 = dataUrl.slice(commaIndex + 1);
  return Math.ceil((base64.length * 3) / 4);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('failed_to_decode_image'));
    image.src = dataUrl;
  });
}

async function compressImageFile(file: File): Promise<string> {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(originalDataUrl);

  const longestEdge = Math.max(image.width, image.height);
  const scale = longestEdge > IMAGE_MAX_EDGE ? IMAGE_MAX_EDGE / longestEdge : 1;
  const targetWidth = Math.max(1, Math.round(image.width * scale));
  const targetHeight = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('failed_to_create_canvas_context');
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  let quality = 0.82;
  let compressed = canvas.toDataURL('image/webp', quality);

  while (estimateDataUrlBytes(compressed) > MAX_COMPRESSED_IMAGE_BYTES && quality > 0.45) {
    quality = Math.round((quality - 0.08) * 100) / 100;
    compressed = canvas.toDataURL('image/webp', quality);
  }

  if (estimateDataUrlBytes(compressed) > MAX_COMPRESSED_IMAGE_BYTES) {
    compressed = canvas.toDataURL('image/jpeg', 0.62);
  }

  return compressed;
}

function serializeImagesForLegacyField(imageUrls: string[]): string | null {
  if (imageUrls.length === 0) {
    return null;
  }

  if (imageUrls.length === 1) {
    return imageUrls[0];
  }

  return JSON.stringify(imageUrls.slice(0, MAX_MEAL_IMAGES));
}

function getRecordImageUrls(record: { imageUrls?: string[]; imageUrl?: string | null }): string[] {
  if (Array.isArray(record.imageUrls) && record.imageUrls.length > 0) {
    return record.imageUrls.slice(0, MAX_MEAL_IMAGES);
  }
  if (record.imageUrl) {
    return [record.imageUrl];
  }
  return [];
}

export default function AddMealPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const editId = searchParams.get('edit');

  const [mealType, setMealType] = useState<MealType>('lunch');
  const [foods, setFoods] = useState<AddedFood[]>([]);
  const [mealImages, setMealImages] = useState<string[]>([]);
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
      setMealImages([]);
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
      setMealImages(getRecordImageUrls(record));
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
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (selectedFiles.length === 0) {
      return;
    }

    const remaining = MAX_MEAL_IMAGES - mealImages.length;
    if (remaining <= 0) {
      setImageError(`每餐最多上传 ${MAX_MEAL_IMAGES} 张图片。`);
      return;
    }

    const files = selectedFiles.slice(0, remaining);
    const nextImages: string[] = [];
    const existingBytes = mealImages.reduce((sum, image) => sum + estimateDataUrlBytes(image), 0);
    let queuedBytes = 0;
    let localError: string | null = null;

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        localError = '仅支持 JPG / PNG / WebP 图片。';
        continue;
      }

      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        localError = `图片过大（${formatImageSize(file.size)}），单张请控制在 ${formatImageSize(MAX_IMAGE_SIZE_BYTES)} 内。`;
        continue;
      }

      try {
        const dataUrl = await compressImageFile(file);
        if (!dataUrl.startsWith('data:image/')) {
          localError = '图片解析失败，请重新选择。';
          continue;
        }

        const imageBytes = estimateDataUrlBytes(dataUrl);
        if (existingBytes + queuedBytes + imageBytes > MAX_TOTAL_IMAGE_BYTES) {
          localError = `压缩后图片总大小仍过大，请控制在 ${formatImageSize(MAX_TOTAL_IMAGE_BYTES)} 内。`;
          continue;
        }

        queuedBytes += imageBytes;
        nextImages.push(dataUrl);
      } catch {
        localError = '图片处理失败，请稍后重试。';
      }
    }

    if (nextImages.length > 0) {
      setMealImages((prev) => [...prev, ...nextImages].slice(0, MAX_MEAL_IMAGES));
    }

    if (selectedFiles.length > remaining) {
      setImageError(`最多还能再添加 ${remaining} 张图片。`);
      return;
    }

    setImageError(localError);
  };

  const handleRemoveImage = (index: number) => {
    setMealImages((prev) => prev.filter((_, i) => i !== index));
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
      imageUrls: mealImages.length > 0 ? mealImages : undefined,
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
      image_url: serializeImagesForLegacyField(mealImages),
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
      imageUrls: mealImages.length > 0 ? mealImages : undefined,
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
            imageUrls: mealImages.length > 0 ? mealImages : null,
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
    } catch (submitError) {
      if (!navigator.onLine) {
        await queueOfflineRecord();
        await navigateToHomeWithFreshData();
        return;
      }

      const message = submitError instanceof Error ? submitError.message.toLowerCase() : '';
      if (message.includes('body') || message.includes('payload') || message.includes('413')) {
        setError('图片数据过大，请减少图片或重新上传后重试。');
      } else {
        setError('网络异常，请稍后重试。');
      }
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
          <h1 className="text-lg font-semibold">{editingRecordId ? '编辑饮食记录' : '添加饮食记录'}</h1>
          <p className="text-xs text-muted-foreground">记录这一餐，让趋势更清晰。</p>
        </div>
      </div>

      <Card className="border-orange-200/60 bg-gradient-to-br from-orange-50 via-amber-50 to-white py-4 shadow-sm">
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
                    : 'border-border bg-white/75 hover:bg-accent'
                }`}
              >
                <div className="text-lg">{type.emoji}</div>
                <div>{type.label}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-orange-200/60 bg-gradient-to-br from-orange-50 via-amber-50 to-white py-4 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ImagePlus className="h-4 w-4 text-orange-500" />
            上传当餐图片（最多 3 张）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageFileChange}
          />

          {mealImages.length > 0 ? (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                {mealImages.map((image, index) => (
                  <div key={`${image.slice(0, 24)}-${index}`} className="relative overflow-hidden rounded-lg border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image}
                      alt={`当餐图片 ${index + 1}`}
                      className="aspect-square w-full object-cover"
                    />
                    <button
                      type="button"
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/70"
                      onClick={() => handleRemoveImage(index)}
                      aria-label={`删除图片 ${index + 1}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {mealImages.length < MAX_MEAL_IMAGES && (
                <Button type="button" variant="outline" size="sm" onClick={triggerImagePicker}>
                  <Upload className="mr-1 h-4 w-4" />
                  继续添加图片
                </Button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={triggerImagePicker}
              className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-orange-300 bg-white/70 px-4 py-8 text-sm text-muted-foreground transition-colors hover:bg-orange-100/50"
            >
              <ImagePlus className="h-6 w-6 text-orange-500" />
              <span className="font-medium text-foreground">点击上传餐图</span>
              <span>后续可接入 AI 自动识别食物和营养分析</span>
            </button>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <p className="flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              支持 JPG / PNG / WebP，自动压缩后总大小约不超过 {formatImageSize(MAX_TOTAL_IMAGE_BYTES)}。
            </p>
            <p>
              已上传 {mealImages.length}/{MAX_MEAL_IMAGES}
            </p>
          </div>

          {imageError && (
            <p className="text-sm text-destructive" role="alert">
              {imageError}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="py-4 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">添加食物</CardTitle>
        </CardHeader>
        <CardContent>
          <FoodSearch onSelect={handleFoodSelect} />
        </CardContent>
      </Card>

      {foods.length > 0 && (
        <Card className="py-4 shadow-sm">
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

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Minus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FoodSearch, type FoodSearchItem } from '@/components/meal/FoodSearch';
import { calculateFoodNutrition, calculateMealTotals } from '@/lib/utils/food-calorie';
import { createMealRecord } from '@/app/actions/meal';
import { enqueueSync, cacheMealRecord } from '@/lib/offline/offline-store';
import { clampNumber, parseOptionalNumber } from '@/lib/validations/number';
import type { MealType, RecognizedFood } from '@/types';

const MEAL_TYPES: { value: MealType; label: string; emoji: string }[] = [
  { value: 'breakfast', label: '早餐', emoji: '🍞' },
  { value: 'lunch', label: '午餐', emoji: '☀️' },
  { value: 'dinner', label: '晚餐', emoji: '🌙' },
  { value: 'snack', label: '加餐', emoji: '🍪' },
];

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

const MIN_SERVING = 1;
const MAX_SERVING = 5000;

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

export default function AddMealPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [foods, setFoods] = useState<AddedFood[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigateToHomeWithFreshData = async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ['meals'] }),
      queryClient.invalidateQueries({ queryKey: ['calorieStats'] }),
    ]);
    router.replace('/');
    router.refresh();
  };

  useEffect(() => {
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
  }, []);

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
        if (i !== index) return food;
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

  const totals = calculateMealTotals(foods);

  const queueOfflineRecord = async () => {
    const recordId = `offline_${Date.now()}`;
    const payload = {
      mealType,
      foods: foods.map((f) => ({
        name: f.name,
        calories: f.calories,
        protein: f.protein,
        fat: f.fat,
        carbs: f.carbs,
        serving: f.serving,
        unit: f.unit,
      })),
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
    });
  };

  const handleSubmit = async () => {
    if (foods.length === 0) {
      setError('请至少添加一种食物');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const payload = {
      mealType,
      foods: foods.map((f) => ({
        name: f.name,
        calories: f.calories,
        protein: f.protein,
        fat: f.fat,
        carbs: f.carbs,
        serving: f.serving,
        unit: f.unit,
      })),
      recordedAt: new Date(),
    };

    try {
      if (!navigator.onLine) {
        await queueOfflineRecord();
        await navigateToHomeWithFreshData();
        return;
      }

      const result = await createMealRecord(payload);
      if (result.success) {
        await navigateToHomeWithFreshData();
        return;
      }

      // If network drops during request, queue it for retry.
      if (!navigator.onLine) {
        await queueOfflineRecord();
        await navigateToHomeWithFreshData();
        return;
      }

      setError(result.error ?? '保存失败');
    } catch {
      if (!navigator.onLine) {
        await queueOfflineRecord();
        await navigateToHomeWithFreshData();
        return;
      }
      setError('网络异常，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="返回">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">添加饮食记录</h1>
      </div>

      <div className="mb-4">
        <Label className="mb-2 block text-sm">选择餐次</Label>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="餐次选择">
          {MEAL_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              role="radio"
              aria-checked={mealType === type.value}
              className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors ${
                mealType === type.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-accent'
              }`}
              onClick={() => setMealType(type.value)}
            >
              <span className="text-xl">{type.emoji}</span>
              <span>{type.label}</span>
            </button>
          ))}
        </div>
      </div>

      <Card className="mb-4 py-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">添加食物</CardTitle>
        </CardHeader>
        <CardContent>
          <FoodSearch onSelect={handleFoodSelect} />
        </CardContent>
      </Card>

      {foods.length > 0 && (
        <Card className="mb-4 py-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">已添加食物</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {foods.map((food, index) => (
              <div key={food.key} className="flex items-center gap-2 rounded-md border p-2">
                <div className="flex-1">
                  <div className="text-sm font-medium">{food.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {food.calories}千卡 | 蛋白质{food.protein}g | 脂肪{food.fat}g | 碳水{food.carbs}g
                  </div>
                </div>
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
                    onChange={(e) => handleServingChange(index, parseOptionalNumber(e.target.value))}
                    onBlur={(e) => handleServingChange(index, parseOptionalNumber(e.target.value))}
                    className="h-8 w-16 rounded-none border-0 px-1 text-center focus-visible:ring-0"
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
            ))}

            <div className="border-t pt-2">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>总计</span>
                <span>{totals.calories} 千卡</span>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>蛋白质 {totals.protein}g</span>
                <span>脂肪 {totals.fat}g</span>
                <span>碳水 {totals.carbs}g</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="mb-4 text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button className="w-full" size="lg" onClick={handleSubmit} disabled={isSubmitting || foods.length === 0}>
        {isSubmitting ? '保存中...' : '保存记录'}
      </Button>
    </div>
  );
}

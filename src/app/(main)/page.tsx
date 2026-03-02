'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { CalorieProgress } from '@/components/home/CalorieProgress';
import { NutritionBreakdown } from '@/components/home/NutritionBreakdown';
import { MealRecordCard } from '@/components/meal/MealRecordCard';
import { MealRecordListSkeleton } from '@/components/skeleton/PageSkeletons';
import { getMealRecordsByDate } from '@/app/actions/meal';
import { getUserProfile } from '@/app/actions/user';
import { deleteMealRecord } from '@/app/actions/meal';
import { calculateDailyTotals } from '@/lib/utils/food-calorie';
import { Card, CardContent } from '@/components/ui/card';
import { History } from 'lucide-react';
import Link from 'next/link';
import type { MealRecord } from '@/types';

/**
 * Home page — today's calorie tracking dashboard.
 * Requirement 5.1: Show current day's consumed calories and target
 * Requirement 5.5: Real-time update when adding/deleting meal records
 */
export default function HomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const today = new Date();

  const { data: profileResult } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => getUserProfile(),
  });

  const {
    data: mealsResult,
    isLoading,
  } = useQuery({
    queryKey: ['meals', today.toDateString()],
    queryFn: () => getMealRecordsByDate(today),
  });

  const profile = profileResult?.data;
  const meals = mealsResult?.data ?? [];
  const target = profile?.dailyCalorieTarget ?? 2000;

  const dailyTotals = calculateDailyTotals(
    meals.map((m) => ({
      calories: m.totalCalories,
      protein: m.totalProtein,
      fat: m.totalFat,
      carbs: m.totalCarbs,
    })),
  );

  const handleDelete = async (id: string) => {
    const result = await deleteMealRecord(id);
    if (result.success) {
      // Invalidate to trigger re-fetch — real-time update (Req 5.5)
      queryClient.invalidateQueries({ queryKey: ['meals'] });
    }
  };

  const handleEdit = (record: MealRecord) => {
    router.push(`/add-meal?edit=${record.id}`);
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">今日饮食</h1>
        <Link
          href="/history"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          aria-label="查看历史记录"
        >
          <History className="h-4 w-4" />
          历史
        </Link>
      </div>

      {/* Calorie progress card */}
      <Card>
        <CardContent className="pt-6">
          <CalorieProgress current={dailyTotals.calories} target={target} />
        </CardContent>
      </Card>

      {/* Nutrition breakdown card */}
      <Card>
        <CardContent className="pt-6">
          <NutritionBreakdown
            protein={dailyTotals.protein}
            fat={dailyTotals.fat}
            carbs={dailyTotals.carbs}
          />
        </CardContent>
      </Card>

      {/* Meal records */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">今日记录</h2>
        {isLoading ? (
          <MealRecordListSkeleton count={3} />
        ) : meals.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            还没有记录，去添加一餐吧 🍽️
          </p>
        ) : (
          meals.map((record) => (
            <MealRecordCard
              key={record.id}
              record={record}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

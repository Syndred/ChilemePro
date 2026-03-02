'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { getMealRecordsByDate, deleteMealRecord } from '@/app/actions/meal';
import { getUserProfile } from '@/app/actions/user';
import { calculateDailyTotals } from '@/lib/utils/food-calorie';
import { MealRecordCard } from '@/components/meal/MealRecordCard';
import { MealRecordListSkeleton } from '@/components/skeleton/PageSkeletons';
import { CalorieProgress } from '@/components/home/CalorieProgress';
import { NutritionBreakdown } from '@/components/home/NutritionBreakdown';
import { DatePicker } from '@/components/ui/date-picker';
import { Card, CardContent } from '@/components/ui/card';
import type { MealRecord } from '@/types';

/**
 * History page - view meal records for any date.
 */
export default function HistoryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [deletingRecordIds, setDeletingRecordIds] = useState<string[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: profileResult } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => getUserProfile(),
  });

  const { data: mealsResult, isLoading } = useQuery({
    queryKey: ['meals', selectedDate.toDateString()],
    queryFn: () => getMealRecordsByDate(selectedDate),
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
    if (deletingRecordIds.includes(id)) {
      return;
    }

    setDeletingRecordIds((prev) => [...prev, id]);
    setDeleteError(null);

    try {
      const result = await deleteMealRecord(id);
      if (!result.success) {
        setDeleteError(result.error ?? '删除失败，请重试。');
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: ['meals', selectedDate.toDateString()],
      });
    } finally {
      setDeletingRecordIds((prev) => prev.filter((recordId) => recordId !== id));
    }
  };

  const handleEdit = (record: MealRecord) => {
    router.push(`/add-meal?edit=${record.id}`);
  };

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  return (
    <div className="mx-auto max-w-lg space-y-4 bg-gradient-to-b from-orange-50/50 via-amber-50/30 to-background p-4">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
          aria-label="返回首页"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-semibold">历史记录</h1>
      </div>

      <DatePicker date={selectedDate} onDateChange={setSelectedDate} />

      <Card className="border-orange-200/60 bg-gradient-to-br from-orange-50 via-amber-50 to-white shadow-sm">
        <CardContent className="pt-6">
          <CalorieProgress current={dailyTotals.calories} target={target} />
        </CardContent>
      </Card>

      <Card className="border-orange-200/60 bg-gradient-to-br from-orange-50 via-amber-50 to-white shadow-sm">
        <CardContent className="pt-6">
          <NutritionBreakdown
            protein={dailyTotals.protein}
            fat={dailyTotals.fat}
            carbs={dailyTotals.carbs}
          />
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            {isToday ? '今日记录' : '当日记录'}
          </h2>
          {deletingRecordIds.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-orange-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              删除中...
            </span>
          ) : null}
        </div>

        {deleteError ? (
          <p className="text-xs text-destructive" role="alert">
            {deleteError}
          </p>
        ) : null}

        {isLoading ? (
          <MealRecordListSkeleton count={3} />
        ) : meals.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">该日期暂无饮食记录</p>
        ) : (
          meals.map((record) => (
            <MealRecordCard
              key={record.id}
              record={record}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isDeleting={deletingRecordIds.includes(record.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

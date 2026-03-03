'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { CalendarDays, Loader2, User as UserIcon } from 'lucide-react';
import { CalorieProgress } from '@/components/home/CalorieProgress';
import { NutritionBreakdown } from '@/components/home/NutritionBreakdown';
import { MealRecordCard } from '@/components/meal/MealRecordCard';
import { MealRecordListSkeleton } from '@/components/skeleton/PageSkeletons';
import { getMealRecordsByDate, deleteMealRecord } from '@/app/actions/meal';
import { getUserProfile } from '@/app/actions/user';
import { calculateDailyTotals } from '@/lib/utils/food-calorie';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/lib/ui/toast';
import type { MealRecord } from '@/types';

const HOME_MEAL_HIGHLIGHT_KEY = 'home:meal-highlight';

interface HomeMealHighlightPayload {
  recordId: string;
  dateKey: string;
}

interface DeleteResult {
  success: boolean;
  error?: string;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutValue: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(timeoutValue), timeoutMs);
    promise
      .then((value) => resolve(value))
      .catch(() => resolve(timeoutValue))
      .finally(() => window.clearTimeout(timer));
  });
}

function sortMealsByLatest(records: MealRecord[]): MealRecord[] {
  return [...records].sort(
    (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
  );
}

/**
 * Home page - calorie tracking dashboard.
 */
export default function HomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const recordNodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [deletingRecordIds, setDeletingRecordIds] = useState<string[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [highlightRecordId, setHighlightRecordId] = useState<string | null>(null);

  const selectedDateKey = selectedDate.toDateString();
  const isToday = selectedDateKey === new Date().toDateString();

  const { data: profileResult } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => getUserProfile(),
  });

  const { data: mealsResult, isLoading } = useQuery({
    queryKey: ['meals', selectedDateKey],
    queryFn: () => getMealRecordsByDate(selectedDate),
  });

  const profile = profileResult?.success ? profileResult.data : undefined;
  const meals = useMemo(
    () => (mealsResult?.success ? mealsResult.data ?? [] : []),
    [mealsResult],
  );
  const orderedMeals = useMemo(() => sortMealsByLatest(meals), [meals]);
  const target = profile?.dailyCalorieTarget ?? 2000;
  const deletingRecordIdSet = useMemo(() => new Set(deletingRecordIds), [deletingRecordIds]);

  const dailyTotals = useMemo(
    () =>
      calculateDailyTotals(
        meals.map((m) => ({
          calories: m.totalCalories,
          protein: m.totalProtein,
          fat: m.totalFat,
          carbs: m.totalCarbs,
        })),
      ),
    [meals],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const raw = sessionStorage.getItem(HOME_MEAL_HIGHLIGHT_KEY);
    if (!raw) {
      return;
    }

    sessionStorage.removeItem(HOME_MEAL_HIGHLIGHT_KEY);

    try {
      const parsed = JSON.parse(raw) as Partial<HomeMealHighlightPayload>;
      if (!parsed.recordId || !parsed.dateKey) {
        return;
      }

      const highlightedDate = new Date(parsed.dateKey);
      if (!Number.isNaN(highlightedDate.getTime())) {
        setSelectedDate(highlightedDate);
      }
      setHighlightRecordId(parsed.recordId);
    } catch {
      // Ignore malformed storage payload
    }
  }, []);

  useEffect(() => {
    if (!highlightRecordId) {
      return;
    }

    const target = recordNodeRefs.current[highlightRecordId];
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const timer = window.setTimeout(() => {
      setHighlightRecordId((current) => (current === highlightRecordId ? null : current));
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [highlightRecordId, selectedDateKey, orderedMeals.length]);

  const handleDelete = useCallback(async (id: string) => {
    if (deletingRecordIds.includes(id)) {
      return;
    }

    setDeletingRecordIds((prev) => [...prev, id]);
    setDeleteError(null);

    try {
      const result = await withTimeout<DeleteResult>(
        deleteMealRecord(id),
        12000,
        { success: false, error: '删除超时，请重试' },
      );
      if (!result.success) {
        toast.error('\u5220\u9664\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5');
        setDeleteError(result.error ?? '删除失败，请重试。');
        return;
      }

      queryClient.setQueryData<{ success: boolean; data?: MealRecord[] }>(
        ['meals', selectedDateKey],
        (current) => {
          if (!current || !current.success) {
            return current;
          }

          return {
            ...current,
            data: (current.data ?? []).filter((record) => record.id !== id),
          };
        },
      );
      void queryClient.invalidateQueries({ queryKey: ['meals', selectedDateKey] });
      void queryClient.invalidateQueries({ queryKey: ['calorieStats'] });
      toast.success('\u5DF2\u5220\u9664\u8BB0\u5F55');
    } catch {
      toast.error('\u5220\u9664\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5');
      setDeleteError('删除失败，请重试。');
    } finally {
      setDeletingRecordIds((prev) => prev.filter((recordId) => recordId !== id));
    }
  }, [deletingRecordIds, queryClient, selectedDateKey]);

  const handleEdit = useCallback((record: MealRecord) => {
    router.push(`/add-meal?edit=${record.id}`);
  }, [router]);

  return (
    <div className="mx-auto max-w-lg space-y-4 bg-gradient-to-b from-orange-50/50 via-amber-50/30 to-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{isToday ? '今日饮食' : '饮食记录'}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {format(selectedDate, 'yyyy年M月d日 EEEE', { locale: zhCN })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-orange-200/80 bg-orange-50/90 px-3 text-xs font-medium text-orange-800 transition hover:border-orange-300 hover:bg-orange-100/90"
                aria-label="选择日期"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                {format(selectedDate, 'M月d日', { locale: zhCN })}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (!date) return;
                  setSelectedDate(date);
                  setIsDatePickerOpen(false);
                }}
                disabled={{ after: new Date() }}
                locale={zhCN}
              />
            </PopoverContent>
          </Popover>

          <Link
            href="/profile"
            className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-orange-200/80 bg-orange-50"
            aria-label="查看我的页面"
          >
            {profile?.avatar ? (
              <Image
                src={profile.avatar}
                alt={profile.nickname || '用户头像'}
                width={36}
                height={36}
                unoptimized
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <UserIcon className="h-4.5 w-4.5 text-orange-700" />
            )}
          </Link>
        </div>
      </div>

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

        {mealsResult && !mealsResult.success ? (
          <p className="py-8 text-center text-sm text-destructive">{mealsResult.error ?? '加载失败，请重试。'}</p>
        ) : isLoading ? (
          <MealRecordListSkeleton count={3} />
        ) : orderedMeals.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            该日期暂无饮食记录
          </p>
        ) : (
          orderedMeals.map((record) => (
            <div
              key={record.id}
              ref={(node) => {
                recordNodeRefs.current[record.id] = node;
              }}
              className={
                record.id === highlightRecordId
                  ? 'rounded-2xl ring-2 ring-orange-300/80 ring-offset-2 ring-offset-white transition-all duration-300'
                  : ''
              }
              style={{ contentVisibility: 'auto', containIntrinsicSize: '420px' }}
            >
              <MealRecordCard
                record={record}
                onEdit={handleEdit}
                onDelete={handleDelete}
                isDeleting={deletingRecordIdSet.has(record.id)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

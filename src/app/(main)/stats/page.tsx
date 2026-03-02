'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { getMealRecordsByDate } from '@/app/actions/meal';
import { getWeightRecords } from '@/app/actions/weight';
import { getUserProfile } from '@/app/actions/user';
import { WeightInput } from '@/components/stats/WeightInput';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, TrendingDown, TrendingUp, Minus } from 'lucide-react';

type Period = 'week' | 'month';
type DailyCalorieData = { date: string; calories: number };

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/** Get date range for a given period ending today. */
function getDateRange(period: Period) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  if (period === 'week') {
    start.setDate(start.getDate() - 6);
  } else {
    start.setDate(start.getDate() - 29);
  }
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

/** Generate all dates in a range as YYYY-MM-DD strings. */
function generateDateLabels(start: Date, end: Date): string[] {
  const labels: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    labels.push(toLocalDateKey(current));
    current.setDate(current.getDate() + 1);
  }
  return labels;
}

/** Format date string to short label (MM/DD). */
function formatDateLabel(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/**
 * Stats page — calorie trends and weight change charts.
 * Requirement 8.1: Weekly calorie trend chart
 * Requirement 8.2: Monthly calorie trend chart
 * Requirement 8.3: Weight change curve
 * Requirement 8.4: Show specific values on data points
 * Requirement 8.5: Support recording daily weight
 * Requirement 8.6: Calculate and display weight change trend
 */
export default function StatsPage() {
  const [period, setPeriod] = useState<Period>('week');
  const { start, end } = useMemo(() => getDateRange(period), [period]);
  const dateLabels = useMemo(() => generateDateLabels(start, end), [start, end]);

  const { data: profileResult } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => getUserProfile(),
  });

  // Fetch meal records for each day in the range
  const {
    data: calorieData,
    isLoading: calorieLoading,
    error: calorieError,
  } = useQuery<DailyCalorieData[]>({
    queryKey: ['calorieStats', period],
    queryFn: async () => {
      const results = await Promise.all(
        dateLabels.map(async (dateStr) => {
          const result = await getMealRecordsByDate(parseLocalDateKey(dateStr));
          if (!result.success) {
            throw new Error(result.error ?? '加载热量统计失败');
          }
          const totalCalories = (result.data ?? []).reduce(
            (sum, m) => sum + m.totalCalories,
            0,
          );
          return { date: dateStr, calories: Math.round(totalCalories) };
        }),
      );
      return results;
    },
  });

  // Fetch weight records for the range
  const {
    data: weightRecords,
    isLoading: weightLoading,
    error: weightError,
  } = useQuery({
    queryKey: ['weightRecords', period],
    queryFn: async () => {
      const result = await getWeightRecords(start, end);
      if (!result.success) {
        throw new Error(result.error ?? '加载体重记录失败');
      }
      return result.data ?? [];
    },
  });

  const target = profileResult?.data?.dailyCalorieTarget ?? 2000;

  // Build calorie chart data
  const calorieChartData = useMemo(() => {
    if (!calorieData) return [];
    return calorieData.map((d) => ({
      date: formatDateLabel(d.date),
      calories: d.calories,
      target,
    }));
  }, [calorieData, target]);

  // Build weight chart data — fill in dates with no record as null
  const weightChartData = useMemo(() => {
    const records = weightRecords ?? [];
    const weightMap = new Map(
      records.map((r) => [toLocalDateKey(r.recordedAt), r.weight]),
    );
    return dateLabels.map((dateStr) => ({
      date: formatDateLabel(dateStr),
      weight: weightMap.get(dateStr) ?? null,
    }));
  }, [weightRecords, dateLabels]);

  // Weight trend calculation
  const weightTrend = useMemo(() => {
    const records = weightRecords ?? [];
    if (records.length < 2) return null;
    const first = records[0].weight;
    const last = records[records.length - 1].weight;
    const diff = last - first;
    return { diff: Math.round(diff * 10) / 10, direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same' as const };
  }, [weightRecords]);

  const hasCalorieData = calorieChartData.some((item) => item.calories > 0);
  const queryErrorMessage =
    (calorieError as Error | null)?.message ?? (weightError as Error | null)?.message ?? null;

  const isLoading = calorieLoading || weightLoading;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (queryErrorMessage) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{queryErrorMessage}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">数据统计</h1>
        <WeightInput />
      </div>

      {/* Period selector */}
      <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
        <TabsList className="w-full">
          <TabsTrigger value="week" className="flex-1">近 7 天</TabsTrigger>
          <TabsTrigger value="month" className="flex-1">近 30 天</TabsTrigger>
        </TabsList>

        {/* Calorie trend chart */}
        <TabsContent value={period} forceMount className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                热量趋势 (kcal)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hasCalorieData ? (
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={calorieChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <Tooltip
                      formatter={(value, name) => [
                        `${value} kcal`,
                        name === 'calories' ? '摄入' : '目标',
                      ]}
                    />
                    <Bar
                      dataKey="calories"
                      fill="var(--primary)"
                      radius={[4, 4, 0, 0]}
                      name="calories"
                    />
                    <Line
                      type="monotone"
                      dataKey="target"
                      stroke="var(--destructive)"
                      strokeDasharray="5 5"
                      dot={false}
                      name="target"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  暂无数据
                </p>
              )}
            </CardContent>
          </Card>

          {/* Weight change curve */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  体重变化 (kg)
                </CardTitle>
                {weightTrend && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {weightTrend.direction === 'down' ? (
                      <TrendingDown className="h-3.5 w-3.5 text-green-500" />
                    ) : weightTrend.direction === 'up' ? (
                      <TrendingUp className="h-3.5 w-3.5 text-red-500" />
                    ) : (
                      <Minus className="h-3.5 w-3.5" />
                    )}
                    {weightTrend.diff > 0 ? '+' : ''}
                    {weightTrend.diff} kg
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {(weightRecords ?? []).length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={weightChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                      domain={['dataMin - 1', 'dataMax + 1']}
                    />
                    <Tooltip
                      formatter={(value) => [
                        value != null ? `${value} kg` : '无记录',
                        '体重',
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: 'var(--primary)' }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  暂无体重记录，点击右上角开始记录
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

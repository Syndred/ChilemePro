'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  CalendarDays,
  Flame,
  Goal,
  Minus,
  Scale,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { getDailyCalorieStats } from '@/app/actions/meal';
import { getUserProfile } from '@/app/actions/user';
import { getWeightRecords } from '@/app/actions/weight';
import { StatsPageSkeleton } from '@/components/skeleton/PageSkeletons';
import { WeightInput } from '@/components/stats/WeightInput';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Period = 'week' | 'month';
type DailyCalorieData = { date: string; calories: number };

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

function generateDateLabels(start: Date, end: Date): string[] {
  const labels: string[] = [];
  const current = new Date(start);

  while (current <= end) {
    labels.push(toLocalDateKey(current));
    current.setDate(current.getDate() + 1);
  }

  return labels;
}

function formatDateLabel(dateStr: string): string {
  const [, month, day] = dateStr.split('-');
  return `${Number(month)}/${Number(day)}`;
}

export default function StatsPage() {
  const [period, setPeriod] = useState<Period>('week');
  const { start, end } = useMemo(() => getDateRange(period), [period]);
  const dateLabels = useMemo(() => generateDateLabels(start, end), [start, end]);

  const profileQuery = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => getUserProfile(),
  });

  const calorieQuery = useQuery<DailyCalorieData[]>({
    queryKey: ['calorieStats', period],
    queryFn: async () => {
      const result = await getDailyCalorieStats(start, end);
      if (!result.success) {
        throw new Error(result.error ?? '加载热量统计失败');
      }

      const byDate = new Map((result.data ?? []).map((item) => [item.date, item.calories]));
      return dateLabels.map((date) => ({
        date,
        calories: byDate.get(date) ?? 0,
      }));
    },
  });

  const weightQuery = useQuery({
    queryKey: ['weightRecords', period],
    queryFn: async () => {
      const result = await getWeightRecords(start, end);
      if (!result.success) {
        throw new Error(result.error ?? '加载体重记录失败');
      }
      return result.data ?? [];
    },
  });

  const target = profileQuery.data?.data?.dailyCalorieTarget ?? 2000;
  const calorieData = useMemo(() => calorieQuery.data ?? [], [calorieQuery.data]);
  const weightRecords = useMemo(() => weightQuery.data ?? [], [weightQuery.data]);

  const calorieChartData = useMemo(
    () =>
      calorieData.map((item) => ({
        date: formatDateLabel(item.date),
        calories: item.calories,
        target,
      })),
    [calorieData, target],
  );

  const weightChartData = useMemo(() => {
    const weightMap = new Map(weightRecords.map((record) => [toLocalDateKey(record.recordedAt), record.weight]));

    return dateLabels.map((date) => ({
      date: formatDateLabel(date),
      weight: weightMap.get(date) ?? null,
    }));
  }, [weightRecords, dateLabels]);

  const summary = useMemo(() => {
    const totalCalories = calorieData.reduce((sum, item) => sum + item.calories, 0);
    const avgCalories = dateLabels.length > 0 ? Math.round(totalCalories / dateLabels.length) : 0;
    const intakeDays = calorieData.filter((item) => item.calories > 0).length;
    const targetHitDays = calorieData.filter((item) => {
      if (item.calories <= 0) return false;
      const lower = target * 0.9;
      const upper = target * 1.1;
      return item.calories >= lower && item.calories <= upper;
    }).length;

    return {
      totalCalories,
      avgCalories,
      intakeDays,
      targetHitDays,
    };
  }, [calorieData, dateLabels.length, target]);

  const weightTrend = useMemo(() => {
    if (weightRecords.length < 2) {
      return null;
    }

    const first = weightRecords[0].weight;
    const last = weightRecords[weightRecords.length - 1].weight;
    const diff = Math.round((last - first) * 10) / 10;

    return {
      diff,
      direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same',
      latest: last,
    } as const;
  }, [weightRecords]);

  const hasCalorieData = calorieData.some((item) => item.calories > 0);
  const hasWeightData = weightRecords.length > 0;

  const errorMessage =
    (calorieQuery.error as Error | null)?.message ??
    (weightQuery.error as Error | null)?.message ??
    null;

  const isLoading = calorieQuery.isLoading || weightQuery.isLoading;

  if (isLoading) {
    return <StatsPageSkeleton />;
  }

  if (errorMessage) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm text-red-700">{errorMessage}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                calorieQuery.refetch();
                weightQuery.refetch();
              }}
            >
              重新加载
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 bg-gradient-to-b from-orange-50/55 via-amber-50/30 to-background p-4">
      <section className="rounded-2xl border border-orange-200/70 bg-gradient-to-br from-amber-200 via-orange-100 to-yellow-50 p-4 shadow-[0_18px_38px_-26px_rgba(193,92,18,0.6)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-orange-900">数据统计</h1>
            <p className="mt-1 text-sm text-orange-800/85">
              观察热量与体重趋势，帮助你更稳定地调整饮食。
            </p>
          </div>
          <WeightInput />
        </div>
      </section>

      <Tabs value={period} onValueChange={(value) => setPeriod(value as Period)}>
        <TabsList className="grid w-full grid-cols-2 rounded-xl bg-orange-100/75 p-1">
          <TabsTrigger
            value="week"
            className="rounded-lg text-xs data-[state=active]:bg-white data-[state=active]:text-orange-700"
          >
            近 7 天
          </TabsTrigger>
          <TabsTrigger
            value="month"
            className="rounded-lg text-xs data-[state=active]:bg-white data-[state=active]:text-orange-700"
          >
            近 30 天
          </TabsTrigger>
        </TabsList>

        <TabsContent value={period} forceMount className="space-y-4 pt-2">
          <div className="grid grid-cols-3 gap-2">
            <Card className="border-orange-200/70 bg-gradient-to-br from-white via-orange-50 to-amber-50">
              <CardContent className="space-y-1 p-3">
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                  <Flame className="h-3.5 w-3.5 text-orange-500" />
                  平均摄入
                </span>
                <p className="text-sm font-semibold text-slate-900">{summary.avgCalories} kcal</p>
              </CardContent>
            </Card>

            <Card className="border-orange-200/70 bg-gradient-to-br from-white via-orange-50 to-amber-50">
              <CardContent className="space-y-1 p-3">
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                  <CalendarDays className="h-3.5 w-3.5 text-orange-500" />
                  有记录天数
                </span>
                <p className="text-sm font-semibold text-slate-900">{summary.intakeDays} 天</p>
              </CardContent>
            </Card>

            <Card className="border-orange-200/70 bg-gradient-to-br from-white via-orange-50 to-amber-50">
              <CardContent className="space-y-1 p-3">
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                  <Goal className="h-3.5 w-3.5 text-orange-500" />
                  达标天数
                </span>
                <p className="text-sm font-semibold text-slate-900">{summary.targetHitDays} 天</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-orange-200/70 bg-gradient-to-br from-white via-orange-50/20 to-amber-50/50">
            <CardHeader className="space-y-1 pb-2">
              <CardTitle className="text-sm font-semibold text-slate-900">热量趋势</CardTitle>
              <p className="text-xs text-slate-500">柱状表示每日摄入，虚线表示你的目标热量</p>
            </CardHeader>
            <CardContent>
              {hasCalorieData ? (
                <ResponsiveContainer width="100%" height={230}>
                  <ComposedChart data={calorieChartData}>
                    <defs>
                      <linearGradient id="calorieBarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f97316" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#fb923c" stopOpacity={0.45} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#fed7aa" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9a3412' }} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#9a3412' }}
                      tickLine={false}
                      axisLine={false}
                      width={42}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '12px',
                        borderColor: '#fed7aa',
                        boxShadow: '0 8px 20px -14px rgba(124,45,18,0.5)',
                      }}
                      formatter={(value, name) => [
                        `${Math.round(Number(value ?? 0))} kcal`,
                        String(name) === 'calories' ? '摄入' : '目标',
                      ]}
                    />
                    <Bar
                      dataKey="calories"
                      name="calories"
                      fill="url(#calorieBarGradient)"
                      radius={[6, 6, 0, 0]}
                    />
                    <Line
                      type="monotone"
                      dataKey="target"
                      name="target"
                      stroke="#ef4444"
                      strokeDasharray="6 6"
                      dot={false}
                      strokeWidth={1.8}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[230px] flex-col items-center justify-center gap-2 text-center text-sm text-slate-500">
                  <Activity className="h-5 w-5 text-orange-400" />
                  <p>当前周期暂无热量记录，先去添加一餐吧。</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-orange-200/70 bg-gradient-to-br from-white via-orange-50/20 to-amber-50/50">
            <CardHeader className="space-y-1 pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold text-slate-900">体重变化</CardTitle>
                {weightTrend ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/85 px-2 py-0.5 text-xs text-slate-600">
                    {weightTrend.direction === 'down' ? (
                      <TrendingDown className="h-3.5 w-3.5 text-green-600" />
                    ) : weightTrend.direction === 'up' ? (
                      <TrendingUp className="h-3.5 w-3.5 text-red-500" />
                    ) : (
                      <Minus className="h-3.5 w-3.5 text-slate-500" />
                    )}
                    {weightTrend.diff > 0 ? '+' : ''}
                    {weightTrend.diff} kg
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-slate-500">
                {weightTrend ? `当前最新体重 ${weightTrend.latest} kg` : '记录至少两次体重后显示变化趋势'}
              </p>
            </CardHeader>
            <CardContent>
              {hasWeightData ? (
                <ResponsiveContainer width="100%" height={230}>
                  <LineChart data={weightChartData}>
                    <defs>
                      <linearGradient id="weightLineGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#f97316" />
                        <stop offset="100%" stopColor="#f59e0b" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#fed7aa" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9a3412' }} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#9a3412' }}
                      tickLine={false}
                      axisLine={false}
                      width={42}
                      domain={['dataMin - 1', 'dataMax + 1']}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '12px',
                        borderColor: '#fed7aa',
                        boxShadow: '0 8px 20px -14px rgba(124,45,18,0.5)',
                      }}
                      formatter={(value) => [
                        value != null ? `${Number(value).toFixed(1)} kg` : '无记录',
                        '体重',
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      stroke="url(#weightLineGradient)"
                      strokeWidth={2.2}
                      dot={{ r: 3, fill: '#f97316' }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[230px] flex-col items-center justify-center gap-2 text-center text-sm text-slate-500">
                  <Scale className="h-5 w-5 text-orange-400" />
                  <p>还没有体重记录，点击右上角按钮开始记录。</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

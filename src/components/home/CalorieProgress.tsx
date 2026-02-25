'use client';

import { Progress } from '@/components/ui/progress';

export interface CalorieProgressProps {
  /** Current calories consumed */
  current: number;
  /** Target calories for the day */
  target: number;
}

/**
 * Determine the color class for the progress bar based on intake percentage.
 * - < 80%: default/muted color
 * - 80-100%: normal green
 * - > 100%: warning red
 *
 * Requirement 5.3: Warning color when >100%
 * Requirement 5.4: Normal color when 80-100%
 */
export function getProgressColor(current: number, target: number): string {
  if (target <= 0) return 'bg-muted';
  const pct = (current / target) * 100;
  if (pct > 100) return 'bg-destructive';
  if (pct >= 80) return 'bg-green-500';
  return 'bg-primary';
}

/**
 * Pure component displaying calorie intake progress.
 * Requirement 5.1: Show current day's consumed calories vs target
 * Requirement 5.2: Progress bar visualization
 */
export function CalorieProgress({ current, target }: CalorieProgressProps) {
  const percentage = target > 0 ? Math.min((current / target) * 100, 150) : 0;
  const displayPct = Math.round(percentage);
  const colorClass = getProgressColor(current, target);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted-foreground">今日摄入</p>
          <p className="text-3xl font-bold tabular-nums">{Math.round(current)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">目标</p>
          <p className="text-lg font-medium tabular-nums text-muted-foreground">
            / {Math.round(target)} 千卡
          </p>
        </div>
      </div>

      <div className="relative">
        <Progress
          value={Math.min(displayPct, 100)}
          className="h-3"
          aria-label={`热量摄入 ${displayPct}%`}
          indicatorClassName={colorClass}
        />
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {target > 0 && current > target
          ? `已超出目标 ${Math.round(current - target)} 千卡`
          : target > 0
            ? `还可摄入 ${Math.round(target - current)} 千卡`
            : '请先设置热量目标'}
      </p>
    </div>
  );
}

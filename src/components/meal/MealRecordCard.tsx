'use client';

import { Trash2, Edit2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { MealRecord, MealType } from '@/types';

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
};

const MEAL_TYPE_EMOJI: Record<MealType, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍪',
};

interface MealRecordCardProps {
  record: MealRecord;
  onEdit?: (record: MealRecord) => void;
  onDelete?: (id: string) => void;
}

export function MealRecordCard({ record, onEdit, onDelete }: MealRecordCardProps) {
  const recordedTimeLabel = new Date(record.recordedAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return (
    <Card className="py-4">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <span>{MEAL_TYPE_EMOJI[record.mealType]}</span>
            <span>{MEAL_TYPE_LABELS[record.mealType]}</span>
            <span className="text-sm font-normal text-muted-foreground">
              {record.totalCalories} 千卡
            </span>
          </CardTitle>
          <div className="flex gap-1">
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onEdit(record)}
                aria-label="编辑记录"
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() => onDelete(record.id)}
                aria-label="删除记录"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">记录时间：{recordedTimeLabel}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Food items list */}
        <ul className="space-y-1" aria-label="食物列表">
          {record.foods.map((food) => (
            <li
              key={food.id}
              className="flex items-center justify-between text-sm"
            >
              <span>{food.name}</span>
              <span className="text-muted-foreground">
                {food.serving}{food.unit} · {food.calories}千卡
              </span>
            </li>
          ))}
        </ul>

        {/* Nutrition summary */}
        <div className="flex gap-4 border-t pt-2 text-xs text-muted-foreground">
          <span>蛋白质 {record.totalProtein}g</span>
          <span>脂肪 {record.totalFat}g</span>
          <span>碳水 {record.totalCarbs}g</span>
        </div>
      </CardContent>
    </Card>
  );
}

'use client';

import { memo, useEffect, useState } from 'react';
import { Edit2, Image as ImageIcon, Loader2, Trash2 } from 'lucide-react';
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
  breakfast: '\u{1F963}',
  lunch: '\u{1F371}',
  dinner: '\u{1F372}',
  snack: '\u{1F34E}',
};

interface MealRecordCardProps {
  record: MealRecord;
  onEdit?: (record: MealRecord) => void;
  onDelete?: (id: string) => Promise<void> | void;
  isDeleting?: boolean;
}

function formatRecordedTime(date: Date): string {
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Shanghai',
    hour12: false,
  });
}

function getMealImageUrls(record: MealRecord): string[] {
  if (Array.isArray(record.imageUrls) && record.imageUrls.length > 0) {
    return record.imageUrls;
  }

  if (record.imageUrl) {
    return [record.imageUrl];
  }

  return [];
}

function MealRecordCardComponent({
  record,
  onEdit,
  onDelete,
  isDeleting = false,
}: MealRecordCardProps) {
  const imageUrls = getMealImageUrls(record);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [record.id, imageUrls.length]);

  const coverImage = imageUrls[activeImageIndex] ?? imageUrls[0] ?? null;
  const hasImageBackground = Boolean(coverImage);

  return (
    <Card className="relative overflow-hidden border-0 py-4 shadow-[0_10px_35px_-15px_rgba(0,0,0,0.35)]">
      {hasImageBackground ? (
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverImage}
            alt="餐次背景图"
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/30 to-black/70" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-orange-100 via-amber-100 to-yellow-50" />
      )}

      {isDeleting ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 backdrop-blur-[1px]">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-800">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            删除中...
          </div>
        </div>
      ) : null}

      <CardHeader className="relative pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle
            className={`flex items-center gap-2 text-base ${
              hasImageBackground ? 'text-white' : 'text-orange-950'
            }`}
          >
            <span>{MEAL_TYPE_EMOJI[record.mealType]}</span>
            <span>{MEAL_TYPE_LABELS[record.mealType]}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                hasImageBackground
                  ? 'bg-white/20 text-white backdrop-blur'
                  : 'bg-orange-200 text-orange-700'
              }`}
            >
              {record.totalCalories} 千卡
            </span>
          </CardTitle>

          <div className="flex gap-1">
            {onEdit ? (
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${
                  hasImageBackground
                    ? 'bg-white/10 text-white hover:bg-white/20'
                    : 'text-orange-700 hover:bg-orange-200/80'
                }`}
                onClick={() => onEdit(record)}
                disabled={isDeleting}
                aria-label="编辑记录"
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            ) : null}

            {onDelete ? (
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${
                  hasImageBackground
                    ? 'bg-white/10 text-white hover:bg-white/20'
                    : 'text-red-600 hover:bg-red-100'
                }`}
                onClick={() => onDelete(record.id)}
                disabled={isDeleting}
                aria-label="删除记录"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            ) : null}
          </div>
        </div>

        <div
          className={`mt-1 flex items-center justify-between text-xs ${
            hasImageBackground ? 'text-white/85' : 'text-orange-800/80'
          }`}
        >
          <span>记录时间: {formatRecordedTime(new Date(record.recordedAt))}</span>
          {imageUrls.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-2 py-0.5 text-[11px] text-white backdrop-blur">
              <ImageIcon className="h-3 w-3" />
              {imageUrls.length}/3 张
            </span>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="relative space-y-2">
        {imageUrls.length > 1 ? (
          <div className="flex gap-1.5">
            {imageUrls.map((url, index) => {
              const isActive = index === activeImageIndex;

              return (
                <button
                  key={`${url.slice(0, 24)}-${index}`}
                  type="button"
                  className={`h-10 w-10 overflow-hidden rounded-md border transition ${
                    isActive
                      ? 'border-orange-300 ring-2 ring-orange-300/70'
                      : hasImageBackground
                        ? 'border-white/35 hover:border-white/70'
                        : 'border-orange-200 hover:border-orange-300'
                  }`}
                  onClick={() => setActiveImageIndex(index)}
                  aria-label={`切换到第 ${index + 1} 张图片`}
                  aria-pressed={isActive}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`附图 ${index + 1}`}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                </button>
              );
            })}
          </div>
        ) : null}

        <ul className="space-y-1" aria-label="食物列表">
          {record.foods.map((food) => (
            <li key={food.id} className="flex items-center justify-between text-sm">
              <span className={hasImageBackground ? 'text-white' : 'text-orange-950'}>{food.name}</span>
              <span className={hasImageBackground ? 'text-white/90' : 'text-orange-800/80'}>
                {food.serving}
                {food.unit} · {food.calories}千卡
              </span>
            </li>
          ))}
        </ul>

        <div
          className={`flex flex-wrap gap-2 border-t pt-2 text-xs ${
            hasImageBackground ? 'border-white/20' : 'border-orange-200/70'
          }`}
        >
          <span
            className={`rounded-full px-2 py-1 ${
              hasImageBackground
                ? 'bg-sky-400/25 text-sky-50 backdrop-blur'
                : 'bg-blue-100 text-blue-700'
            }`}
          >
            蛋白质 {record.totalProtein}g
          </span>
          <span
            className={`rounded-full px-2 py-1 ${
              hasImageBackground
                ? 'bg-rose-400/25 text-rose-50 backdrop-blur'
                : 'bg-rose-100 text-rose-700'
            }`}
          >
            脂肪 {record.totalFat}g
          </span>
          <span
            className={`rounded-full px-2 py-1 ${
              hasImageBackground
                ? 'bg-emerald-400/25 text-emerald-50 backdrop-blur'
                : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            碳水 {record.totalCarbs}g
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export const MealRecordCard = memo(MealRecordCardComponent);
MealRecordCard.displayName = 'MealRecordCard';

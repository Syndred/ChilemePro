import { z } from 'zod';

export interface NumericRangeFieldOptions {
  label: string;
  min: number;
  max: number;
  integer?: boolean;
  requiredMessage?: string;
  invalidMessage?: string;
  minMessage?: string;
  maxMessage?: string;
  integerMessage?: string;
}

export function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeNumberByStep(value: number, step: number): number {
  const decimals = step.toString().includes('.')
    ? step.toString().split('.')[1]?.length ?? 0
    : 0;

  return Number(value.toFixed(decimals));
}

export function numericRangeField(options: NumericRangeFieldOptions) {
  const {
    label,
    min,
    max,
    integer = false,
    requiredMessage = `${label}不能为空`,
    invalidMessage = `${label}请输入有效数字`,
    minMessage = `${label}不能低于${min}`,
    maxMessage = `${label}不能超过${max}`,
    integerMessage = `${label}必须是整数`,
  } = options;

  const numberSchema = z
    .number({
      error: (issue) =>
        issue.input === undefined ? requiredMessage : invalidMessage,
    })
    .min(min, minMessage)
    .max(max, maxMessage);

  return integer
    ? numberSchema.refine((value) => Number.isInteger(value), integerMessage)
    : numberSchema;
}

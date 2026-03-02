'use client';

import type { InputHTMLAttributes } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  clampNumber,
  normalizeNumberByStep,
  parseOptionalNumber,
} from '@/lib/validations/number';

interface NumberStepperFieldProps {
  id: string;
  label: string;
  value?: number;
  min: number;
  max: number;
  step?: number;
  fallbackValue?: number;
  unit?: string;
  placeholder?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  error?: string;
  onChange: (value: number | undefined) => void;
}

export function NumberStepperField({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  fallbackValue,
  unit,
  placeholder,
  inputMode,
  error,
  onChange,
}: NumberStepperFieldProps) {
  const safeStep = step > 0 ? step : 1;
  const safeValue = Number.isFinite(value) ? value : undefined;

  const applyDelta = (direction: 1 | -1) => {
    const baseValue = safeValue ?? fallbackValue ?? min;
    const nextValue = normalizeNumberByStep(
      clampNumber(baseValue + direction * safeStep, min, max),
      safeStep,
    );
    onChange(nextValue);
  };

  const handleBlur = () => {
    if (safeValue === undefined) {
      return;
    }

    const normalized = normalizeNumberByStep(
      clampNumber(safeValue, min, max),
      safeStep,
    );

    if (normalized !== safeValue) {
      onChange(normalized);
    }
  };

  const inputModeValue =
    inputMode ?? (Number.isInteger(safeStep) ? 'numeric' : 'decimal');

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {unit ? ` (${unit})` : ''}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min={min}
          max={max}
          step={safeStep}
          value={safeValue ?? ''}
          inputMode={inputModeValue}
          placeholder={placeholder}
          className="pr-10"
          aria-describedby={`${id}-error`}
          onChange={(e) => onChange(parseOptionalNumber(e.target.value))}
          onBlur={handleBlur}
        />
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 flex-col">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-4 w-6 rounded-sm p-0"
            onClick={() => applyDelta(1)}
            aria-label={`${label}增加`}
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-4 w-6 rounded-sm p-0"
            onClick={() => applyDelta(-1)}
            aria-label={`${label}减少`}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

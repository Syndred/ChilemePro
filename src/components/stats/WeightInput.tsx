'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Scale } from 'lucide-react';
import { saveWeightRecord } from '@/app/actions/weight';
import { NumberStepperField } from '@/components/form/NumberStepperField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const DEFAULT_WEIGHT = 65;

/**
 * Dialog component for recording daily weight.
 */
export function WeightInput() {
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState<number | undefined>(DEFAULT_WEIGHT);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (w: number) => {
      const result = await saveWeightRecord(w, new Date());
      if (!result.success) {
        throw new Error(result.error ?? '记录体重失败，请重试');
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weightRecords'] });
      setWeight(DEFAULT_WEIGHT);
      setError('');
      setOpen(false);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (weight === undefined || !Number.isFinite(weight) || weight < 30 || weight > 300) {
      setError('请输入 30-300 之间的体重值');
      return;
    }

    setError('');
    mutation.mutate(weight);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Scale className="h-4 w-4" />
          记录体重
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>记录今日体重</DialogTitle>
          <DialogDescription>用于生成趋势图和周/月变化分析。</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <NumberStepperField
            id="weight-input"
            label="体重"
            unit="kg"
            min={30}
            max={300}
            step={0.1}
            placeholder="例如 65.5"
            value={weight}
            fallbackValue={DEFAULT_WEIGHT}
            error={error}
            onChange={(value) => {
              setWeight(value);
              if (error) {
                setError('');
              }
            }}
          />

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            保存
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

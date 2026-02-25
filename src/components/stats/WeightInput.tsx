'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveWeightRecord } from '@/app/actions/weight';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Scale, Loader2 } from 'lucide-react';

/**
 * WeightInput — dialog component for recording daily weight.
 * Requirement 8.5: Support recording daily weight
 */
export function WeightInput() {
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (w: number) => {
      const result = await saveWeightRecord(w, new Date());
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weightRecords'] });
      setWeight('');
      setError('');
      setOpen(false);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(weight);
    if (isNaN(value) || value < 30 || value > 300) {
      setError('请输入 30-300 之间的体重值');
      return;
    }
    setError('');
    mutation.mutate(value);
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
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="weight-input">体重 (kg)</Label>
            <Input
              id="weight-input"
              type="number"
              step="0.1"
              min="30"
              max="300"
              placeholder="例如: 65.5"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            保存
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

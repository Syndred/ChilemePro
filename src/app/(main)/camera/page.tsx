'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, AlertCircle, RefreshCw, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CameraCapture } from '@/components/ai/CameraCapture';
import { FoodSearch, type FoodSearchItem } from '@/components/meal/FoodSearch';
import type { FoodRecognitionResult, RecognizedFood } from '@/types';

type PageState =
  | 'capture'      // Taking / selecting photo
  | 'recognizing'  // AI processing
  | 'result'       // AI returned results
  | 'manual'       // Manual fallback mode
  | 'error';       // Upload / recognition error

export default function CameraPage() {
  const router = useRouter();
  const [state, setState] = useState<PageState>('capture');
  const [recognitionResult, setRecognitionResult] = useState<FoodRecognitionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [capturedImage, setCapturedImage] = useState<File | null>(null);
  const [selectedFoods, setSelectedFoods] = useState<RecognizedFood[]>([]);

  // ── Handle photo capture ──────────────────────────────────────
  const handleCapture = useCallback(async (image: File) => {
    setCapturedImage(image);
    setState('recognizing');
    setErrorMessage('');

    try {
      const formData = new FormData();
      formData.append('image', image);

      const response = await fetch('/api/ai/vision', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.timedOut) {
        // Requirement 4.5 & 4.7: timeout → manual mode
        setState('manual');
        return;
      }

      if (!response.ok || !data.success) {
        if (data.data?.foods?.length === 0) {
          // No foods recognized → manual mode
          setState('manual');
          return;
        }
        // Requirement 4.6: show error and allow retry
        setErrorMessage(data.error || '识别失败，请重试');
        setState('error');
        return;
      }

      // Requirement 4.3: display recognized food name, calories, nutrition
      setRecognitionResult(data.data);
      setSelectedFoods(data.data.foods);
      setState('result');
    } catch {
      // Requirement 4.6: show error and allow retry on upload failure
      setErrorMessage('上传失败，请检查网络后重试');
      setState('error');
    }
  }, []);

  // ── Retry recognition ─────────────────────────────────────────
  const handleRetry = useCallback(() => {
    if (capturedImage) {
      handleCapture(capturedImage);
    } else {
      setState('capture');
    }
  }, [capturedImage, handleCapture]);

  // ── Switch to manual mode ─────────────────────────────────────
  const handleSwitchToManual = useCallback(() => {
    setState('manual');
  }, []);

  // ── Handle manual food selection ──────────────────────────────
  const handleManualFoodSelect = useCallback((food: FoodSearchItem) => {
    const recognized: RecognizedFood = {
      name: food.name,
      calories: food.caloriesPerServing,
      protein: food.proteinPerServing,
      fat: food.fatPerServing,
      carbs: food.carbsPerServing,
      confidence: 1,
    };
    setSelectedFoods((prev) => [...prev, recognized]);
  }, []);

  // ── Remove a food from selection ──────────────────────────────
  const handleRemoveFood = useCallback((index: number) => {
    setSelectedFoods((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Confirm and go to add-meal ────────────────────────────────
  const handleConfirm = useCallback(() => {
    // Store selected foods in sessionStorage for the add-meal page to pick up
    if (selectedFoods.length > 0) {
      sessionStorage.setItem('ai-recognized-foods', JSON.stringify(selectedFoods));
    }
    router.push('/add-meal');
  }, [selectedFoods, router]);

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="返回">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">
          {state === 'manual' ? '手动录入' : 'AI 拍照识别'}
        </h1>
      </div>

      <AnimatePresence mode="wait">
        {/* ── Capture state ──────────────────────────────────── */}
        {state === 'capture' && (
          <motion.div key="capture" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <CameraCapture
              onCapture={handleCapture}
              onCancel={() => router.back()}
            />
          </motion.div>
        )}

        {/* ── Recognizing state ──────────────────────────────── */}
        {state === 'recognizing' && (
          <motion.div
            key="recognizing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 py-16"
          >
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">AI 正在识别食物...</p>
            <p className="text-xs text-muted-foreground">超过 10 秒将自动转为手动模式</p>
            <Button variant="ghost" size="sm" onClick={handleSwitchToManual}>
              直接手动录入
            </Button>
          </motion.div>
        )}

        {/* ── Result state ───────────────────────────────────── */}
        {state === 'result' && recognitionResult && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <p className="text-sm text-muted-foreground">
              识别完成 · 耗时 {(recognitionResult.processingTime / 1000).toFixed(1)}s
              · 置信度 {Math.round(recognitionResult.confidence * 100)}%
            </p>

            {/* Recognized foods list */}
            <div className="space-y-2">
              {selectedFoods.map((food, idx) => (
                <Card key={idx} className="flex items-center justify-between p-3">
                  <div>
                    <p className="font-medium">{food.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {food.calories} 千卡 · 蛋白质 {food.protein}g · 脂肪 {food.fat}g · 碳水 {food.carbs}g
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveFood(idx)}
                    aria-label={`移除 ${food.name}`}
                  >
                    <span className="text-destructive">✕</span>
                  </Button>
                </Card>
              ))}
            </div>

            {/* Requirement 4.4: allow manual correction */}
            <Button variant="outline" className="w-full" onClick={handleSwitchToManual}>
              <Pencil className="mr-1 h-4 w-4" />
              手动修正 / 添加更多食物
            </Button>

            <Button className="w-full" onClick={handleConfirm} disabled={selectedFoods.length === 0}>
              确认添加 ({selectedFoods.length} 项)
            </Button>
          </motion.div>
        )}

        {/* ── Manual fallback state ──────────────────────────── */}
        {state === 'manual' && (
          <motion.div
            key="manual"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <p className="text-sm text-muted-foreground">
              请从常见食物列表中选择，或自定义添加
            </p>

            <FoodSearch onSelect={handleManualFoodSelect} />

            {/* Selected foods */}
            {selectedFoods.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">已选择的食物</p>
                {selectedFoods.map((food, idx) => (
                  <Card key={idx} className="flex items-center justify-between p-3">
                    <div>
                      <p className="font-medium">{food.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {food.calories} 千卡 · 蛋白质 {food.protein}g · 脂肪 {food.fat}g · 碳水 {food.carbs}g
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveFood(idx)}
                      aria-label={`移除 ${food.name}`}
                    >
                      <span className="text-destructive">✕</span>
                    </Button>
                  </Card>
                ))}
              </div>
            )}

            <Button className="w-full" onClick={handleConfirm} disabled={selectedFoods.length === 0}>
              确认添加 ({selectedFoods.length} 项)
            </Button>
          </motion.div>
        )}

        {/* ── Error state ────────────────────────────────────── */}
        {state === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 py-16"
          >
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="text-center text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleRetry}>
                <RefreshCw className="mr-1 h-4 w-4" />
                重试
              </Button>
              <Button variant="outline" onClick={handleSwitchToManual}>
                手动录入
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

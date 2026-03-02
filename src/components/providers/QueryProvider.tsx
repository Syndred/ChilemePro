'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { createMealRecord } from '@/app/actions/meal';
import {
  getPendingSyncItems,
  markSynced,
  markSyncFailed,
} from '@/lib/offline/offline-store';
import type { MealType } from '@/types';

async function processOfflineQueue() {
  if (typeof window === 'undefined' || !navigator.onLine) {
    return;
  }
  if (typeof indexedDB === 'undefined') {
    return;
  }

  const pendingItems = await getPendingSyncItems();
  for (const item of pendingItems) {
    try {
      if (
        item.tableName === 'meal_records' &&
        item.operation === 'create' &&
        item.data
      ) {
        const payload = item.data as {
          mealType: MealType;
          foods: Array<{
            name: string;
            calories: number;
            protein: number;
            fat: number;
            carbs: number;
            serving: number;
            unit: string;
          }>;
          recordedAt: string;
        };

        const result = await createMealRecord({
          mealType: payload.mealType,
          foods: payload.foods,
          recordedAt: new Date(payload.recordedAt),
        });

        if (result.success) {
          await markSynced(item.id);
        } else {
          await markSyncFailed(item.id);
        }
      } else {
        // Unknown queue item type: keep queue healthy.
        await markSynced(item.id);
      }
    } catch {
      await markSyncFailed(item.id);
    }
  }
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  const syncingRef = useRef(false);

  useEffect(() => {
    const runSync = async () => {
      if (syncingRef.current) {
        return;
      }
      syncingRef.current = true;
      try {
        await processOfflineQueue();
      } finally {
        syncingRef.current = false;
      }
    };

    runSync();

    const onOnline = () => {
      runSync();
    };

    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

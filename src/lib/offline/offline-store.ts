/**
 * IndexedDB 离线存储层
 * 薄封装层，将 IndexedDB 操作委托给纯函数处理逻辑
 * 需求: 17.3 - 支持离线访问核心功能
 * 需求: 19.3 - 离线时将数据缓存到本地
 * 需求: 19.4 - 重新联网后自动同步本地缓存数据
 */

import type { SyncQueueItem, AddToQueueParams } from './sync-queue';
import { addToQueue, removeFromQueue, removeMultipleFromQueue, getPendingItems, incrementRetry } from './sync-queue';
import type { TimestampedRecord, BatchMergeResult } from './conflict-resolver';
import { batchMerge } from './conflict-resolver';

const DB_NAME = 'chi-le-me-offline';
const DB_VERSION = 1;

/** 存储对象名称 */
const STORES = {
  SYNC_QUEUE: 'sync_queue',
  MEAL_RECORDS: 'meal_records',
  FOOD_ITEMS: 'food_items',
  META: 'meta',
} as const;

/**
 * 打开 IndexedDB 数据库
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
        syncStore.createIndex('tableName', 'tableName', { unique: false });
        syncStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.MEAL_RECORDS)) {
        const mealStore = db.createObjectStore(STORES.MEAL_RECORDS, { keyPath: 'id' });
        mealStore.createIndex('userId', 'userId', { unique: false });
        mealStore.createIndex('recordedAt', 'recordedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.FOOD_ITEMS)) {
        const foodStore = db.createObjectStore(STORES.FOOD_ITEMS, { keyPath: 'id' });
        foodStore.createIndex('mealRecordId', 'mealRecordId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.META)) {
        db.createObjectStore(STORES.META, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 通用 IDB 事务辅助
 */
async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = callback(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * 获取存储中的所有记录
 */
async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  return withStore<T[]>(storeName, 'readonly', (store) => store.getAll());
}

/**
 * 将记录写入存储
 */
async function putToStore<T>(storeName: string, data: T): Promise<IDBValidKey> {
  return withStore<IDBValidKey>(storeName, 'readwrite', (store) => store.put(data));
}

/**
 * 从存储中删除记录
 */
async function deleteFromStore(storeName: string, key: string): Promise<undefined> {
  return withStore<undefined>(storeName, 'readwrite', (store) => store.delete(key));
}

// ============================================================
// 同步队列操作（委托给 sync-queue.ts 纯函数）
// ============================================================

/**
 * 添加操作到同步队列
 */
export async function enqueueSync(params: AddToQueueParams): Promise<void> {
  const currentQueue = await getAllFromStore<SyncQueueItem>(STORES.SYNC_QUEUE);
  const updatedQueue = addToQueue(currentQueue, params);

  // 找出新增或变更的条目并写入
  const currentIds = new Set(currentQueue.map((i) => i.id));
  for (const item of updatedQueue) {
    const existing = currentQueue.find((i) => i.id === item.id);
    if (!existing || JSON.stringify(existing) !== JSON.stringify(item)) {
      await putToStore(STORES.SYNC_QUEUE, item);
    }
  }

  // 删除被合并抵消的条目
  for (const item of currentQueue) {
    if (!updatedQueue.find((i) => i.id === item.id)) {
      await deleteFromStore(STORES.SYNC_QUEUE, item.id);
    }
  }
}

/**
 * 获取待同步条目
 */
export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  const queue = await getAllFromStore<SyncQueueItem>(STORES.SYNC_QUEUE);
  return getPendingItems(queue);
}

/**
 * 标记条目同步成功，从队列移除
 */
export async function markSynced(itemId: string): Promise<void> {
  await deleteFromStore(STORES.SYNC_QUEUE, itemId);
}

/**
 * 批量标记同步成功
 */
export async function markMultipleSynced(itemIds: string[]): Promise<void> {
  for (const id of itemIds) {
    await deleteFromStore(STORES.SYNC_QUEUE, id);
  }
}

/**
 * 标记条目同步失败，增加重试计数
 */
export async function markSyncFailed(itemId: string): Promise<void> {
  const queue = await getAllFromStore<SyncQueueItem>(STORES.SYNC_QUEUE);
  const updated = incrementRetry(queue, itemId);
  const item = updated.find((i) => i.id === itemId);
  if (item) {
    await putToStore(STORES.SYNC_QUEUE, item);
  }
}

// ============================================================
// 本地数据缓存操作
// ============================================================

/**
 * 缓存饮食记录到本地
 */
export async function cacheMealRecord(record: TimestampedRecord): Promise<void> {
  await putToStore(STORES.MEAL_RECORDS, record);
}

/**
 * 获取本地缓存的所有饮食记录
 */
export async function getCachedMealRecords(): Promise<TimestampedRecord[]> {
  return getAllFromStore<TimestampedRecord>(STORES.MEAL_RECORDS);
}

/**
 * 合并本地和远程饮食记录（委托给 conflict-resolver.ts）
 */
export async function mergeMealRecords(
  remoteRecords: TimestampedRecord[],
): Promise<BatchMergeResult<TimestampedRecord>> {
  const localRecords = await getCachedMealRecords();
  const result = batchMerge(localRecords, remoteRecords);

  // 将合并结果写入本地
  for (const record of result.merged) {
    await putToStore(STORES.MEAL_RECORDS, record);
  }

  return result;
}

/**
 * 记录最后同步时间
 */
export async function setLastSyncTime(time: Date): Promise<void> {
  await putToStore(STORES.META, { key: 'lastSyncTime', value: time.toISOString() });
}

/**
 * 获取最后同步时间
 */
export async function getLastSyncTime(): Promise<Date | null> {
  try {
    const result = await withStore<{ key: string; value: string } | undefined>(
      STORES.META,
      'readonly',
      (store) => store.get('lastSyncTime'),
    );
    return result ? new Date(result.value) : null;
  } catch {
    return null;
  }
}

/**
 * 清除所有离线数据（用于登出等场景）
 */
export async function clearOfflineData(): Promise<void> {
  const db = await openDB();
  const storeNames = [STORES.SYNC_QUEUE, STORES.MEAL_RECORDS, STORES.FOOD_ITEMS, STORES.META];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');
    for (const name of storeNames) {
      tx.objectStore(name).clear();
    }
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export { STORES, DB_NAME, DB_VERSION };

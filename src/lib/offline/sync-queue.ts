/**
 * 离线同步队列管理
 * 管理离线时的数据写入队列，联网后自动同步
 * 需求: 19.3 - 离线时将数据缓存到本地
 * 需求: 19.4 - 重新联网后自动同步本地缓存数据
 */

/** 同步操作类型 */
export type SyncOperation = 'create' | 'update' | 'delete';

/** 同步队列条目 */
export interface SyncQueueItem {
  /** 唯一标识 */
  id: string;
  /** 操作类型 */
  operation: SyncOperation;
  /** 数据表名 */
  tableName: string;
  /** 记录 ID */
  recordId: string;
  /** 操作数据（delete 时为 null） */
  data: Record<string, unknown> | null;
  /** 创建时间 ISO 字符串 */
  createdAt: string;
  /** 重试次数 */
  retryCount: number;
  /** 最大重试次数 */
  maxRetries: number;
}

/** 队列添加参数 */
export interface AddToQueueParams {
  operation: SyncOperation;
  tableName: string;
  recordId: string;
  data?: Record<string, unknown> | null;
}

const DEFAULT_MAX_RETRIES = 5;

/**
 * 生成简单的唯一 ID（不依赖 crypto API）
 */
export function generateQueueId(): string {
  return `sq_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 创建一个新的同步队列条目
 */
export function createQueueItem(
  params: AddToQueueParams,
  id?: string,
): SyncQueueItem {
  return {
    id: id ?? generateQueueId(),
    operation: params.operation,
    tableName: params.tableName,
    recordId: params.recordId,
    data: params.data ?? null,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    maxRetries: DEFAULT_MAX_RETRIES,
  };
}

/**
 * 向队列添加条目，如果同一记录已有待处理操作则合并
 * 合并规则：
 * - create + update → create（用最新数据）
 * - create + delete → 移除两者（从未同步过，直接丢弃）
 * - update + update → update（用最新数据）
 * - update + delete → delete
 * - delete + create → update（记录已存在于服务器）
 */
export function addToQueue(
  queue: SyncQueueItem[],
  params: AddToQueueParams,
): SyncQueueItem[] {
  const existingIndex = queue.findIndex(
    (item) => item.tableName === params.tableName && item.recordId === params.recordId,
  );

  if (existingIndex === -1) {
    // 没有已有操作，直接添加
    return [...queue, createQueueItem(params)];
  }

  const existing = queue[existingIndex];
  const merged = mergeOperations(existing, params);

  if (merged === null) {
    // 操作互相抵消，移除
    return queue.filter((_, i) => i !== existingIndex);
  }

  // 替换已有条目
  return queue.map((item, i) => (i === existingIndex ? merged : item));
}

/**
 * 合并两个操作，返回合并后的条目或 null（表示互相抵消）
 */
function mergeOperations(
  existing: SyncQueueItem,
  incoming: AddToQueueParams,
): SyncQueueItem | null {
  const { operation: existingOp } = existing;
  const { operation: incomingOp } = incoming;

  if (existingOp === 'create' && incomingOp === 'update') {
    // create + update → create with latest data
    return { ...existing, data: incoming.data ?? existing.data };
  }

  if (existingOp === 'create' && incomingOp === 'delete') {
    // create + delete → cancel out
    return null;
  }

  if (existingOp === 'update' && incomingOp === 'update') {
    // update + update → update with latest data
    return {
      ...existing,
      data: incoming.data ? { ...existing.data, ...incoming.data } : existing.data,
      createdAt: new Date().toISOString(),
    };
  }

  if (existingOp === 'update' && incomingOp === 'delete') {
    // update + delete → delete
    return { ...existing, operation: 'delete', data: null, createdAt: new Date().toISOString() };
  }

  if (existingOp === 'delete' && incomingOp === 'create') {
    // delete + create → update (record exists on server)
    return {
      ...existing,
      operation: 'update',
      data: incoming.data ?? null,
      createdAt: new Date().toISOString(),
    };
  }

  // 其他情况：直接用新操作替换
  return createQueueItem(incoming, existing.id);
}

/**
 * 从队列中移除已成功同步的条目
 */
export function removeFromQueue(
  queue: SyncQueueItem[],
  itemId: string,
): SyncQueueItem[] {
  return queue.filter((item) => item.id !== itemId);
}

/**
 * 批量移除已同步的条目
 */
export function removeMultipleFromQueue(
  queue: SyncQueueItem[],
  itemIds: string[],
): SyncQueueItem[] {
  const idSet = new Set(itemIds);
  return queue.filter((item) => !idSet.has(item.id));
}

/**
 * 获取所有待同步的条目（按创建时间排序）
 */
export function getPendingItems(queue: SyncQueueItem[]): SyncQueueItem[] {
  return [...queue]
    .filter((item) => item.retryCount < item.maxRetries)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * 增加条目的重试计数
 */
export function incrementRetry(
  queue: SyncQueueItem[],
  itemId: string,
): SyncQueueItem[] {
  return queue.map((item) =>
    item.id === itemId ? { ...item, retryCount: item.retryCount + 1 } : item,
  );
}

/**
 * 获取已超过最大重试次数的条目（死信队列）
 */
export function getDeadLetterItems(queue: SyncQueueItem[]): SyncQueueItem[] {
  return queue.filter((item) => item.retryCount >= item.maxRetries);
}

/**
 * 获取队列中指定表的条目数量
 */
export function getQueueCountByTable(
  queue: SyncQueueItem[],
  tableName: string,
): number {
  return queue.filter((item) => item.tableName === tableName).length;
}

/**
 * 获取队列总大小
 */
export function getQueueSize(queue: SyncQueueItem[]): number {
  return queue.length;
}

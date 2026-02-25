import { describe, it, expect } from 'vitest';
import {
  createQueueItem,
  addToQueue,
  removeFromQueue,
  removeMultipleFromQueue,
  getPendingItems,
  incrementRetry,
  getDeadLetterItems,
  getQueueCountByTable,
  getQueueSize,
  type SyncQueueItem,
  type AddToQueueParams,
} from './sync-queue';

// ============================================================
// createQueueItem
// ============================================================

describe('createQueueItem', () => {
  it('创建包含所有字段的队列条目', () => {
    const params: AddToQueueParams = {
      operation: 'create',
      tableName: 'meal_records',
      recordId: 'rec-1',
      data: { name: 'test' },
    };

    const item = createQueueItem(params);
    expect(item.operation).toBe('create');
    expect(item.tableName).toBe('meal_records');
    expect(item.recordId).toBe('rec-1');
    expect(item.data).toEqual({ name: 'test' });
    expect(item.retryCount).toBe(0);
    expect(item.maxRetries).toBe(5);
    expect(item.id).toMatch(/^sq_/);
    expect(item.createdAt).toBeTruthy();
  });

  it('delete 操作 data 为 null', () => {
    const item = createQueueItem({
      operation: 'delete',
      tableName: 'meal_records',
      recordId: 'rec-1',
    });
    expect(item.data).toBeNull();
  });

  it('可以指定自定义 ID', () => {
    const item = createQueueItem(
      { operation: 'create', tableName: 't', recordId: 'r' },
      'custom-id',
    );
    expect(item.id).toBe('custom-id');
  });
});

// ============================================================
// addToQueue - 基本添加
// ============================================================

describe('addToQueue - 基本添加', () => {
  it('向空队列添加条目', () => {
    const result = addToQueue([], {
      operation: 'create',
      tableName: 'meal_records',
      recordId: 'rec-1',
      data: { name: 'test' },
    });
    expect(result).toHaveLength(1);
    expect(result[0].operation).toBe('create');
    expect(result[0].recordId).toBe('rec-1');
  });

  it('不同记录的操作独立添加', () => {
    let queue: SyncQueueItem[] = [];
    queue = addToQueue(queue, {
      operation: 'create',
      tableName: 'meal_records',
      recordId: 'rec-1',
    });
    queue = addToQueue(queue, {
      operation: 'create',
      tableName: 'meal_records',
      recordId: 'rec-2',
    });
    expect(queue).toHaveLength(2);
  });
});

// ============================================================
// addToQueue - 操作合并
// ============================================================

describe('addToQueue - 操作合并', () => {
  it('create + update → create（用最新数据）', () => {
    let queue: SyncQueueItem[] = [];
    queue = addToQueue(queue, {
      operation: 'create',
      tableName: 'meal_records',
      recordId: 'rec-1',
      data: { name: 'original' },
    });
    queue = addToQueue(queue, {
      operation: 'update',
      tableName: 'meal_records',
      recordId: 'rec-1',
      data: { name: 'updated' },
    });

    expect(queue).toHaveLength(1);
    expect(queue[0].operation).toBe('create');
    expect(queue[0].data).toEqual({ name: 'updated' });
  });

  it('create + delete → 互相抵消', () => {
    let queue: SyncQueueItem[] = [];
    queue = addToQueue(queue, {
      operation: 'create',
      tableName: 'meal_records',
      recordId: 'rec-1',
      data: { name: 'test' },
    });
    queue = addToQueue(queue, {
      operation: 'delete',
      tableName: 'meal_records',
      recordId: 'rec-1',
    });

    expect(queue).toHaveLength(0);
  });

  it('update + update → update（合并数据）', () => {
    let queue: SyncQueueItem[] = [];
    queue = addToQueue(queue, {
      operation: 'update',
      tableName: 'meal_records',
      recordId: 'rec-1',
      data: { name: 'first' },
    });
    queue = addToQueue(queue, {
      operation: 'update',
      tableName: 'meal_records',
      recordId: 'rec-1',
      data: { name: 'second', calories: 500 },
    });

    expect(queue).toHaveLength(1);
    expect(queue[0].operation).toBe('update');
    expect(queue[0].data).toEqual({ name: 'second', calories: 500 });
  });

  it('update + delete → delete', () => {
    let queue: SyncQueueItem[] = [];
    queue = addToQueue(queue, {
      operation: 'update',
      tableName: 'meal_records',
      recordId: 'rec-1',
      data: { name: 'test' },
    });
    queue = addToQueue(queue, {
      operation: 'delete',
      tableName: 'meal_records',
      recordId: 'rec-1',
    });

    expect(queue).toHaveLength(1);
    expect(queue[0].operation).toBe('delete');
    expect(queue[0].data).toBeNull();
  });

  it('delete + create → update', () => {
    let queue: SyncQueueItem[] = [];
    queue = addToQueue(queue, {
      operation: 'delete',
      tableName: 'meal_records',
      recordId: 'rec-1',
    });
    queue = addToQueue(queue, {
      operation: 'create',
      tableName: 'meal_records',
      recordId: 'rec-1',
      data: { name: 'recreated' },
    });

    expect(queue).toHaveLength(1);
    expect(queue[0].operation).toBe('update');
    expect(queue[0].data).toEqual({ name: 'recreated' });
  });

  it('不同表的同 ID 记录不合并', () => {
    let queue: SyncQueueItem[] = [];
    queue = addToQueue(queue, {
      operation: 'create',
      tableName: 'meal_records',
      recordId: 'rec-1',
    });
    queue = addToQueue(queue, {
      operation: 'delete',
      tableName: 'food_items',
      recordId: 'rec-1',
    });

    expect(queue).toHaveLength(2);
  });
});

// ============================================================
// removeFromQueue / removeMultipleFromQueue
// ============================================================

describe('removeFromQueue', () => {
  it('移除指定条目', () => {
    const item = createQueueItem({
      operation: 'create',
      tableName: 't',
      recordId: 'r',
    });
    const queue = [item];
    const result = removeFromQueue(queue, item.id);
    expect(result).toHaveLength(0);
  });

  it('移除不存在的 ID 不影响队列', () => {
    const item = createQueueItem({
      operation: 'create',
      tableName: 't',
      recordId: 'r',
    });
    const result = removeFromQueue([item], 'nonexistent');
    expect(result).toHaveLength(1);
  });
});

describe('removeMultipleFromQueue', () => {
  it('批量移除多个条目', () => {
    const items = [
      createQueueItem({ operation: 'create', tableName: 't', recordId: 'r1' }, 'id1'),
      createQueueItem({ operation: 'create', tableName: 't', recordId: 'r2' }, 'id2'),
      createQueueItem({ operation: 'create', tableName: 't', recordId: 'r3' }, 'id3'),
    ];
    const result = removeMultipleFromQueue(items, ['id1', 'id3']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('id2');
  });
});

// ============================================================
// getPendingItems
// ============================================================

describe('getPendingItems', () => {
  it('返回未超过重试次数的条目，按时间排序', () => {
    const items: SyncQueueItem[] = [
      createQueueItem({ operation: 'create', tableName: 't', recordId: 'r2' }, 'id2'),
      createQueueItem({ operation: 'create', tableName: 't', recordId: 'r1' }, 'id1'),
    ];
    // 手动设置 createdAt 确保排序
    items[0].createdAt = '2024-01-15T12:00:00.000Z';
    items[1].createdAt = '2024-01-15T10:00:00.000Z';

    const pending = getPendingItems(items);
    expect(pending).toHaveLength(2);
    expect(pending[0].id).toBe('id1'); // 更早的排前面
    expect(pending[1].id).toBe('id2');
  });

  it('过滤掉已超过最大重试次数的条目', () => {
    const item = createQueueItem({ operation: 'create', tableName: 't', recordId: 'r' });
    item.retryCount = 5; // 等于 maxRetries
    expect(getPendingItems([item])).toHaveLength(0);
  });
});

// ============================================================
// incrementRetry
// ============================================================

describe('incrementRetry', () => {
  it('增加指定条目的重试计数', () => {
    const item = createQueueItem(
      { operation: 'create', tableName: 't', recordId: 'r' },
      'id1',
    );
    const result = incrementRetry([item], 'id1');
    expect(result[0].retryCount).toBe(1);
  });

  it('不影响其他条目', () => {
    const items = [
      createQueueItem({ operation: 'create', tableName: 't', recordId: 'r1' }, 'id1'),
      createQueueItem({ operation: 'create', tableName: 't', recordId: 'r2' }, 'id2'),
    ];
    const result = incrementRetry(items, 'id1');
    expect(result[0].retryCount).toBe(1);
    expect(result[1].retryCount).toBe(0);
  });
});

// ============================================================
// getDeadLetterItems
// ============================================================

describe('getDeadLetterItems', () => {
  it('返回超过最大重试次数的条目', () => {
    const items: SyncQueueItem[] = [
      { ...createQueueItem({ operation: 'create', tableName: 't', recordId: 'r1' }), retryCount: 5 },
      { ...createQueueItem({ operation: 'create', tableName: 't', recordId: 'r2' }), retryCount: 2 },
      { ...createQueueItem({ operation: 'create', tableName: 't', recordId: 'r3' }), retryCount: 6 },
    ];
    const dead = getDeadLetterItems(items);
    expect(dead).toHaveLength(2);
  });

  it('空队列返回空数组', () => {
    expect(getDeadLetterItems([])).toEqual([]);
  });
});

// ============================================================
// getQueueCountByTable / getQueueSize
// ============================================================

describe('getQueueCountByTable', () => {
  it('返回指定表的条目数量', () => {
    const items = [
      createQueueItem({ operation: 'create', tableName: 'meal_records', recordId: 'r1' }),
      createQueueItem({ operation: 'create', tableName: 'food_items', recordId: 'r2' }),
      createQueueItem({ operation: 'update', tableName: 'meal_records', recordId: 'r3' }),
    ];
    expect(getQueueCountByTable(items, 'meal_records')).toBe(2);
    expect(getQueueCountByTable(items, 'food_items')).toBe(1);
    expect(getQueueCountByTable(items, 'users')).toBe(0);
  });
});

describe('getQueueSize', () => {
  it('返回队列总大小', () => {
    const items = [
      createQueueItem({ operation: 'create', tableName: 't', recordId: 'r1' }),
      createQueueItem({ operation: 'create', tableName: 't', recordId: 'r2' }),
    ];
    expect(getQueueSize(items)).toBe(2);
    expect(getQueueSize([])).toBe(0);
  });
});

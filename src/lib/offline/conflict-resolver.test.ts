import { describe, it, expect } from 'vitest';
import {
  parseTimestamp,
  compareTimestamps,
  resolveConflict,
  batchMerge,
  type TimestampedRecord,
} from './conflict-resolver';

// ============================================================
// parseTimestamp
// ============================================================

describe('parseTimestamp', () => {
  it('解析有效 ISO 时间戳', () => {
    const ts = '2024-01-15T10:30:00.000Z';
    expect(parseTimestamp(ts)).toBe(Date.parse(ts));
  });

  it('无效时间戳返回 0', () => {
    expect(parseTimestamp('not-a-date')).toBe(0);
    expect(parseTimestamp('')).toBe(0);
  });
});

// ============================================================
// compareTimestamps
// ============================================================

describe('compareTimestamps', () => {
  it('本地更新时返回 local', () => {
    const local = '2024-01-15T12:00:00.000Z';
    const remote = '2024-01-15T10:00:00.000Z';
    expect(compareTimestamps(local, remote)).toBe('local');
  });

  it('远程更新时返回 remote', () => {
    const local = '2024-01-15T08:00:00.000Z';
    const remote = '2024-01-15T10:00:00.000Z';
    expect(compareTimestamps(local, remote)).toBe('remote');
  });

  it('时间戳相同时返回 remote（服务器优先）', () => {
    const ts = '2024-01-15T10:00:00.000Z';
    expect(compareTimestamps(ts, ts)).toBe('remote');
  });

  it('本地无效时间戳时返回 remote', () => {
    expect(compareTimestamps('invalid', '2024-01-15T10:00:00.000Z')).toBe('remote');
  });

  it('远程无效时间戳时返回 local', () => {
    expect(compareTimestamps('2024-01-15T10:00:00.000Z', 'invalid')).toBe('local');
  });

  it('两个都无效时返回 remote', () => {
    expect(compareTimestamps('bad', 'bad')).toBe('remote');
  });
});

// ============================================================
// resolveConflict
// ============================================================

describe('resolveConflict', () => {
  it('选择更新的本地记录', () => {
    const local: TimestampedRecord = {
      id: '1',
      updated_at: '2024-01-15T12:00:00.000Z',
      name: 'local-data',
    };
    const remote: TimestampedRecord = {
      id: '1',
      updated_at: '2024-01-15T10:00:00.000Z',
      name: 'remote-data',
    };

    const result = resolveConflict(local, remote);
    expect(result.winner).toBe('local');
    expect(result.data).toBe(local);
    expect(result.data.name).toBe('local-data');
  });

  it('选择更新的远程记录', () => {
    const local: TimestampedRecord = {
      id: '1',
      updated_at: '2024-01-15T08:00:00.000Z',
      name: 'local-data',
    };
    const remote: TimestampedRecord = {
      id: '1',
      updated_at: '2024-01-15T10:00:00.000Z',
      name: 'remote-data',
    };

    const result = resolveConflict(local, remote);
    expect(result.winner).toBe('remote');
    expect(result.data).toBe(remote);
    expect(result.data.name).toBe('remote-data');
  });

  it('时间戳相同时选择远程', () => {
    const ts = '2024-01-15T10:00:00.000Z';
    const local: TimestampedRecord = { id: '1', updated_at: ts, source: 'local' };
    const remote: TimestampedRecord = { id: '1', updated_at: ts, source: 'remote' };

    const result = resolveConflict(local, remote);
    expect(result.winner).toBe('remote');
    expect(result.data.source).toBe('remote');
  });
});

// ============================================================
// batchMerge
// ============================================================

describe('batchMerge', () => {
  it('仅本地有的记录标记为 pushToServer', () => {
    const local: TimestampedRecord[] = [
      { id: 'a', updated_at: '2024-01-15T10:00:00.000Z' },
    ];
    const remote: TimestampedRecord[] = [];

    const result = batchMerge(local, remote);
    expect(result.merged).toHaveLength(1);
    expect(result.pushToServer).toEqual(['a']);
    expect(result.pullToLocal).toEqual([]);
  });

  it('仅远程有的记录标记为 pullToLocal', () => {
    const local: TimestampedRecord[] = [];
    const remote: TimestampedRecord[] = [
      { id: 'b', updated_at: '2024-01-15T10:00:00.000Z' },
    ];

    const result = batchMerge(local, remote);
    expect(result.merged).toHaveLength(1);
    expect(result.pushToServer).toEqual([]);
    expect(result.pullToLocal).toEqual(['b']);
  });

  it('两边都有时根据时间戳解决冲突', () => {
    const local: TimestampedRecord[] = [
      { id: 'c', updated_at: '2024-01-15T12:00:00.000Z', val: 'local' },
    ];
    const remote: TimestampedRecord[] = [
      { id: 'c', updated_at: '2024-01-15T10:00:00.000Z', val: 'remote' },
    ];

    const result = batchMerge(local, remote);
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].val).toBe('local');
    expect(result.pushToServer).toEqual(['c']);
    expect(result.pullToLocal).toEqual([]);
  });

  it('混合场景正确合并', () => {
    const local: TimestampedRecord[] = [
      { id: '1', updated_at: '2024-01-15T12:00:00.000Z' }, // 本地更新
      { id: '2', updated_at: '2024-01-15T08:00:00.000Z' }, // 远程更新
      { id: '3', updated_at: '2024-01-15T10:00:00.000Z' }, // 仅本地
    ];
    const remote: TimestampedRecord[] = [
      { id: '1', updated_at: '2024-01-15T10:00:00.000Z' },
      { id: '2', updated_at: '2024-01-15T10:00:00.000Z' },
      { id: '4', updated_at: '2024-01-15T10:00:00.000Z' }, // 仅远程
    ];

    const result = batchMerge(local, remote);
    expect(result.merged).toHaveLength(4);
    expect(result.pushToServer).toContain('1');
    expect(result.pushToServer).toContain('3');
    expect(result.pullToLocal).toContain('2');
    expect(result.pullToLocal).toContain('4');
  });

  it('空列表合并返回空结果', () => {
    const result = batchMerge([], []);
    expect(result.merged).toEqual([]);
    expect(result.pushToServer).toEqual([]);
    expect(result.pullToLocal).toEqual([]);
  });
});

/**
 * 离线数据冲突解决器
 * 使用 updated_at 时间戳策略解决本地与服务器数据冲突
 * 需求: 19.5 - 处理数据冲突，优先使用最新时间戳的数据
 */

/** 带时间戳的数据记录 */
export interface TimestampedRecord {
  id: string;
  updated_at: string; // ISO 8601 timestamp
  [key: string]: unknown;
}

/** 冲突解决结果 */
export type ConflictResolution = 'local' | 'remote';

/** 合并结果 */
export interface MergeResult<T extends TimestampedRecord> {
  winner: ConflictResolution;
  data: T;
}

/**
 * 解析 ISO 时间戳为毫秒数，无效时间戳返回 0
 */
export function parseTimestamp(ts: string): number {
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * 比较两个时间戳，返回哪个更新
 * 相同时间戳时优先使用远程（服务器）数据，保证一致性
 */
export function compareTimestamps(
  localTs: string,
  remoteTs: string,
): ConflictResolution {
  const localMs = parseTimestamp(localTs);
  const remoteMs = parseTimestamp(remoteTs);

  // 本地严格更新时才选本地，否则选远程（含相等情况）
  return localMs > remoteMs ? 'local' : 'remote';
}

/**
 * 解决单条记录的冲突
 * 根据 updated_at 时间戳选择最新的数据
 */
export function resolveConflict<T extends TimestampedRecord>(
  local: T,
  remote: T,
): MergeResult<T> {
  const winner = compareTimestamps(local.updated_at, remote.updated_at);
  return {
    winner,
    data: winner === 'local' ? local : remote,
  };
}

/**
 * 批量合并本地和远程记录
 * - 仅本地有的记录：保留（需要同步到服务器）
 * - 仅远程有的记录：保留（需要写入本地）
 * - 两边都有的记录：使用 updated_at 解决冲突
 *
 * 返回合并后的完整记录列表和需要推送到服务器的记录 ID 列表
 */
export interface BatchMergeResult<T extends TimestampedRecord> {
  /** 合并后的完整记录列表 */
  merged: T[];
  /** 需要推送到服务器的本地记录 ID */
  pushToServer: string[];
  /** 需要写入本地的远程记录 ID */
  pullToLocal: string[];
}

export function batchMerge<T extends TimestampedRecord>(
  localRecords: T[],
  remoteRecords: T[],
): BatchMergeResult<T> {
  const localMap = new Map(localRecords.map((r) => [r.id, r]));
  const remoteMap = new Map(remoteRecords.map((r) => [r.id, r]));

  const merged: T[] = [];
  const pushToServer: string[] = [];
  const pullToLocal: string[] = [];

  // 处理本地记录
  for (const [id, local] of localMap) {
    const remote = remoteMap.get(id);
    if (!remote) {
      // 仅本地有 → 需要推送到服务器
      merged.push(local);
      pushToServer.push(id);
    } else {
      // 两边都有 → 解决冲突
      const result = resolveConflict(local, remote);
      merged.push(result.data);
      if (result.winner === 'local') {
        pushToServer.push(id);
      } else {
        pullToLocal.push(id);
      }
    }
  }

  // 处理仅远程有的记录
  for (const [id, remote] of remoteMap) {
    if (!localMap.has(id)) {
      merged.push(remote);
      pullToLocal.push(id);
    }
  }

  return { merged, pushToServer, pullToLocal };
}

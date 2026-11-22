import { describe, expect, it, vi } from 'vitest';
import {
  enqueueOfflineCreate,
  enqueueOfflineToggle,
  mergeOfflineOp,
  replayOfflineQueue,
  type OfflineTodoOp,
  type QueueStorage,
} from './offline-queue';

function memoryStorage(initial: OfflineTodoOp[] = []): QueueStorage & { items: OfflineTodoOp[] } {
  const store = {
    items: [...initial],
    read: async () => [...store.items],
    write: async (ops: OfflineTodoOp[]) => {
      store.items = [...ops];
    },
  };
  return store;
}

describe('offline-queue', () => {
  it('合并对同一条待办的连续切换，并把临时待办的勾选合入 create', () => {
    let ops: OfflineTodoOp[] = [];
    ops = mergeOfflineOp(ops, {
      id: '1',
      kind: 'create',
      tempId: 'offline-1',
      input: { title: '交报告', priority: 3, repeat: 'none', reminders: [] },
      queuedAt: '2026-11-21T00:00:00Z',
    });
    ops = mergeOfflineOp(ops, {
      id: '2',
      kind: 'toggle',
      todoId: 'offline-1',
      done: true,
      queuedAt: '2026-11-21T00:01:00Z',
    });
    expect(ops).toHaveLength(1);
    expect(ops[0]!.kind === 'create' && ops[0]!.completedAfterCreate).toBe(true);

    ops = mergeOfflineOp(ops, {
      id: '3',
      kind: 'toggle',
      todoId: 'real-1',
      done: true,
      queuedAt: '2026-11-21T00:02:00Z',
    });
    ops = mergeOfflineOp(ops, {
      id: '4',
      kind: 'toggle',
      todoId: 'real-1',
      done: false,
      queuedAt: '2026-11-21T00:03:00Z',
    });
    expect(ops).toHaveLength(2);
    expect(ops[1]!.kind === 'toggle' && ops[1]!.done).toBe(false);
  });

  it('恢复联网后按 FIFO 顺序回放并刷新待办缓存；遇到网络异常保留剩余条目', async () => {
    const storage = memoryStorage();
    const tempId = await enqueueOfflineCreate(
      { title: '离线的作业', priority: 2, repeat: 'none', reminders: [] },
      storage,
    );
    await enqueueOfflineToggle(tempId, true, storage);
    await enqueueOfflineToggle('t-real', true, storage);

    const executed: string[] = [];
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);

    // 第一条成功，第二条模拟断网 TypeError，应保留第二条
    const synced1 = await replayOfflineQueue(
      { invalidateQueries },
      {
        storage,
        silent: true,
        executor: async (op) => {
          if (op.kind === 'toggle' && op.todoId === 't-real') {
            throw new TypeError('Failed to fetch');
          }
          executed.push(op.kind);
        },
      },
    );
    expect(synced1).toBe(1);
    expect(executed).toEqual(['create']);
    expect(storage.items).toHaveLength(1);
    expect(invalidateQueries).toHaveBeenCalledTimes(1);

    // 再次联网回放剩余一条
    const synced2 = await replayOfflineQueue(
      { invalidateQueries },
      {
        storage,
        silent: true,
        executor: async (op) => {
          executed.push(op.kind);
        },
      },
    );
    expect(synced2).toBe(1);
    expect(executed).toEqual(['create', 'toggle']);
    expect(storage.items).toHaveLength(0);
  });
});

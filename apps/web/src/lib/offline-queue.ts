/**
 * 离线待办写操作队列（基于 idb-keyval，零新依赖）：
 * 在教学楼/地下食堂断网或弱网时，允许继续极速新建待办和勾选完成，
 * 先乐观更新本地列表，恢复联网后按顺序无感回放同步到服务端。
 */
import type { Todo, TodoCompleteResult, TodoInput } from '@gduthelp/shared';
import type { QueryClient } from '@tanstack/react-query';
import { get, set } from 'idb-keyval';
import { create } from 'zustand';
import { api, ApiError, NETWORK_ERROR } from './api';
import { keys } from './queries';
import { toast } from './toast-store';

const STORAGE_KEY = 'gduthelp-offline-todo-queue';

export type OfflineTodoOp =
  | {
      id: string;
      kind: 'create';
      tempId: string;
      input: TodoInput;
      completedAfterCreate?: boolean;
      queuedAt: string;
    }
  | {
      id: string;
      kind: 'toggle';
      todoId: string;
      done: boolean;
      queuedAt: string;
    };

export interface QueueStorage {
  read: () => Promise<OfflineTodoOp[]>;
  write: (ops: OfflineTodoOp[]) => Promise<void>;
}

const defaultStorage: QueueStorage = {
  read: async () => (await get<OfflineTodoOp[]>(STORAGE_KEY)) ?? [],
  write: (ops) => set(STORAGE_KEY, ops),
};

interface OfflineQueueState {
  pendingCount: number;
  syncing: boolean;
  setPendingCount: (count: number) => void;
  setSyncing: (syncing: boolean) => void;
}

export const useOfflineQueue = create<OfflineQueueState>((setState) => ({
  pendingCount: 0,
  syncing: false,
  setPendingCount: (pendingCount) => setState({ pendingCount }),
  setSyncing: (syncing) => setState({ syncing }),
}));

let opLock: Promise<void> = Promise.resolve();
let replaying = false;

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 构造离线新建待办的临时展示对象 */
export function makeOfflineTodo(tempId: string, input: TodoInput, now = new Date()): Todo {
  return {
    id: tempId,
    title: input.title,
    note: input.note ?? null,
    dueAt: input.dueAt ?? null,
    priority: input.priority ?? 3,
    repeat: input.repeat ?? 'none',
    completedAt: null,
    createdAt: now.toISOString(),
    reminders: [],
  };
}

/** 纯合并规则：对同一条待办的重复切换或对尚未同步临时待办的勾选进行压缩 */
export function mergeOfflineOp(ops: OfflineTodoOp[], next: OfflineTodoOp): OfflineTodoOp[] {
  if (next.kind === 'create') {
    return [...ops, next];
  }
  // 如果操作的是尚未同步的临时待办，直接合入对应的 create 操作
  const createIdx = ops.findIndex((o) => o.kind === 'create' && o.tempId === next.todoId);
  if (createIdx >= 0) {
    const copy = [...ops];
    const target = copy[createIdx]!;
    if (target.kind === 'create') {
      copy[createIdx] = { ...target, completedAfterCreate: next.done };
    }
    return copy;
  }
  // 对同一条已存在待办的连续勾选，保留最新目标状态即可
  const filtered = ops.filter((o) => !(o.kind === 'toggle' && o.todoId === next.todoId));
  return [...filtered, next];
}

export async function hydrateOfflineQueue(storage: QueueStorage = defaultStorage): Promise<number> {
  try {
    const ops = await storage.read();
    useOfflineQueue.getState().setPendingCount(ops.length);
    return ops.length;
  } catch {
    return 0;
  }
}

export function enqueueOfflineCreate(input: TodoInput, storage: QueueStorage = defaultStorage): Promise<string> {
  const tempId = `offline-${uid()}`;
  const op: OfflineTodoOp = {
    id: uid(),
    kind: 'create',
    tempId,
    input,
    queuedAt: new Date().toISOString(),
  };
  const task = opLock.then(async () => {
    const prev = await storage.read();
    const next = mergeOfflineOp(prev, op);
    await storage.write(next);
    useOfflineQueue.getState().setPendingCount(next.length);
  });
  opLock = task.catch(() => {});
  return task.then(() => tempId);
}

export function enqueueOfflineToggle(
  todoId: string,
  done: boolean,
  storage: QueueStorage = defaultStorage,
): Promise<void> {
  const op: OfflineTodoOp = {
    id: uid(),
    kind: 'toggle',
    todoId,
    done,
    queuedAt: new Date().toISOString(),
  };
  const task = opLock.then(async () => {
    const prev = await storage.read();
    const next = mergeOfflineOp(prev, op);
    await storage.write(next);
    useOfflineQueue.getState().setPendingCount(next.length);
  });
  opLock = task.catch(() => {});
  return task;
}

/** 判断错误是否属于网络不可达（而非业务校验 4xx） */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof ApiError) return err.code === NETWORK_ERROR || err.status === 0;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return err instanceof TypeError;
}

export async function replayOfflineQueue(
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
  opts?: {
    storage?: QueueStorage;
    executor?: (op: OfflineTodoOp) => Promise<void>;
    silent?: boolean;
  },
): Promise<number> {
  if (replaying) return 0;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;

  const storage = opts?.storage ?? defaultStorage;
  const executor =
    opts?.executor ??
    (async (op: OfflineTodoOp) => {
      if (op.kind === 'create') {
        const created = await api<Todo>('/todos', { method: 'POST', body: op.input });
        if (op.completedAfterCreate) {
          await api<TodoCompleteResult>(`/todos/${created.id}/complete`, { method: 'POST' });
        }
      } else {
        await api<TodoCompleteResult>(`/todos/${op.todoId}/${op.done ? 'complete' : 'reopen'}`, {
          method: 'POST',
        });
      }
    });

  replaying = true;
  useOfflineQueue.getState().setSyncing(true);
  let synced = 0;

  try {
    await opLock;
    const ops = await storage.read();
    if (!ops.length) {
      useOfflineQueue.getState().setPendingCount(0);
      return 0;
    }

    const remaining: OfflineTodoOp[] = [];
    let abortedByNetwork = false;

    for (const op of ops) {
      if (abortedByNetwork) {
        remaining.push(op);
        continue;
      }
      try {
        await executor(op);
        synced++;
      } catch (err) {
        if (isNetworkError(err)) {
          abortedByNetwork = true;
          remaining.push(op);
        } else {
          // 404/400 等业务错误（例如待办已在其他设备被删除）：丢弃该过期条目，继续同步后续操作
        }
      }
    }

    await storage.write(remaining);
    useOfflineQueue.getState().setPendingCount(remaining.length);

    if (synced > 0) {
      await queryClient.invalidateQueries({ queryKey: keys.todos });
      if (!opts?.silent) toast.success(`已同步 ${synced} 条离线待办操作`);
    }
  } finally {
    replaying = false;
    useOfflineQueue.getState().setSyncing(false);
  }

  return synced;
}

export async function clearOfflineQueue(storage: QueueStorage = defaultStorage): Promise<void> {
  await storage.write([]);
  useOfflineQueue.getState().setPendingCount(0);
}

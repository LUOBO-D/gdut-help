import type { Todo, TodoCompleteResult, TodoInput } from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import {
  enqueueOfflineCreate,
  enqueueOfflineToggle,
  isNetworkError,
  makeOfflineTodo,
} from '../../lib/offline-queue';
import { keys } from '../../lib/queries';
import { toast } from '../../lib/toast-store';

/** 勾选完成 / 取消完成：先更新界面，断网自动入离线队列并在恢复联网时回放；业务错误才回滚 */
export function useToggleTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }): Promise<TodoCompleteResult & { offlineQueued?: boolean }> => {
      if (!navigator.onLine || id.startsWith('offline-')) {
        await enqueueOfflineToggle(id, done);
        const current = qc.getQueryData<Todo[]>(keys.todos)?.find((t) => t.id === id);
        return {
          ...(current ?? {
            id,
            title: '',
            note: null,
            dueAt: null,
            priority: 3,
            repeat: 'none' as const,
            createdAt: new Date().toISOString(),
            reminders: [],
          }),
          completedAt: done ? new Date().toISOString() : null,
          offlineQueued: true,
        };
      }
      try {
        return await api<TodoCompleteResult>(`/todos/${id}/${done ? 'complete' : 'reopen'}`, { method: 'POST' });
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueueOfflineToggle(id, done);
          const current = qc.getQueryData<Todo[]>(keys.todos)?.find((t) => t.id === id);
          return {
            ...(current ?? {
              id,
              title: '',
              note: null,
              dueAt: null,
              priority: 3,
              repeat: 'none' as const,
              createdAt: new Date().toISOString(),
              reminders: [],
            }),
            completedAt: done ? new Date().toISOString() : null,
            offlineQueued: true,
          };
        }
        throw err;
      }
    },
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: keys.todos });
      const prev = qc.getQueryData<Todo[]>(keys.todos);
      qc.setQueryData<Todo[]>(keys.todos, (list) =>
        list?.map((t) => (t.id === id ? { ...t, completedAt: done ? new Date().toISOString() : null } : t)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(keys.todos, ctx.prev),
    onSuccess: (res) => {
      if (res.offlineQueued) {
        toast.info('已离线记录，联网后自动同步');
        return;
      }
      const { nextTodo, ...todo } = res;
      qc.setQueryData<Todo[]>(keys.todos, (list) => {
        if (!list) return list;
        const updated = list.map((t) => (t.id === todo.id ? todo : t));
        return nextTodo && !updated.some((t) => t.id === nextTodo.id) ? [...updated, nextTodo] : updated;
      });
      void qc.invalidateQueries({ queryKey: keys.recommendationsPrefix });
    },
  });
}

export function useSaveTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: TodoInput }): Promise<Todo & { offlineQueued?: boolean }> => {
      if (!id && !navigator.onLine) {
        const tempId = await enqueueOfflineCreate(input);
        const temp = makeOfflineTodo(tempId, input);
        qc.setQueryData<Todo[]>(keys.todos, (list) => (list ? [...list, temp] : [temp]));
        return { ...temp, offlineQueued: true };
      }
      try {
        return id
          ? await api<Todo>(`/todos/${id}`, { method: 'PUT', body: input })
          : await api<Todo>('/todos', { method: 'POST', body: input });
      } catch (err) {
        if (!id && isNetworkError(err)) {
          const tempId = await enqueueOfflineCreate(input);
          const temp = makeOfflineTodo(tempId, input);
          qc.setQueryData<Todo[]>(keys.todos, (list) => (list ? [...list, temp] : [temp]));
          return { ...temp, offlineQueued: true };
        }
        throw err;
      }
    },
    onSuccess: (res) => {
      if (res.offlineQueued) {
        toast.info('已离线保存，联网后自动同步');
        return;
      }
      void qc.invalidateQueries({ queryKey: keys.todos });
      void qc.invalidateQueries({ queryKey: keys.recommendationsPrefix });
    },
  });
}

export function useDeleteTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<null>(`/todos/${id}`, { method: 'DELETE' }),
    onSuccess: (_d, id) => {
      qc.setQueryData<Todo[]>(keys.todos, (list) => list?.filter((t) => t.id !== id));
      void qc.invalidateQueries({ queryKey: keys.recommendationsPrefix });
    },
  });
}

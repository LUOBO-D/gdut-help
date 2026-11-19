import type { Todo, TodoInput } from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { keys } from '../../lib/queries';

/** 勾选完成 / 取消完成：先更新界面，请求失败再回滚 */
export function useToggleTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      api<Todo>(`/todos/${id}/${done ? 'complete' : 'reopen'}`, { method: 'POST' }),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: keys.todos });
      const prev = qc.getQueryData<Todo[]>(keys.todos);
      qc.setQueryData<Todo[]>(keys.todos, (list) =>
        list?.map((t) => (t.id === id ? { ...t, completedAt: done ? new Date().toISOString() : null } : t)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(keys.todos, ctx.prev),
    onSuccess: (todo) => qc.setQueryData<Todo[]>(keys.todos, (list) => list?.map((t) => (t.id === todo.id ? todo : t))),
  });
}

export function useSaveTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: TodoInput }) =>
      id ? api<Todo>(`/todos/${id}`, { method: 'PUT', body: input }) : api<Todo>('/todos', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.todos }),
  });
}

export function useDeleteTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<null>(`/todos/${id}`, { method: 'DELETE' }),
    onSuccess: (_d, id) => qc.setQueryData<Todo[]>(keys.todos, (list) => list?.filter((t) => t.id !== id)),
  });
}

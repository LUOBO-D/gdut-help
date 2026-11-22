import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TodoService } from './todo.service.js';

describe('TodoService repeating rollover', () => {
  it('完成每周重复待办时自动在事务内生成下周实例并顺延提醒', async () => {
    const due = new Date('2026-11-27T22:00:00+08:00');
    const createdTodos: Record<string, unknown>[] = [];
    const createdReminders: Record<string, unknown>[] = [];

    const existingRow = {
      id: 't1',
      userId: 'u1',
      title: '提交实验室周报',
      note: '发群里',
      dueAt: due,
      priority: 2,
      repeat: 'weekly' as const,
      completedAt: null,
      createdAt: new Date('2026-11-20T10:00:00+08:00'),
      updatedAt: new Date('2026-11-20T10:00:00+08:00'),
      reminders: [
        {
          id: 'r1',
          todoId: 't1',
          userId: 'u1',
          offsetMinutes: 60,
          fireAt: new Date(due.getTime() - 60 * 60_000),
          status: 'pending' as const,
          sentAt: null,
          createdAt: new Date(),
        },
      ],
    };

    let createdNextRow: Record<string, unknown> | null = null;

    const tx = {
      todo: {
        findUniqueOrThrow: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          if (where.id === 't1') return Promise.resolve({ ...existingRow, completedAt: new Date() });
          return Promise.resolve({ ...createdNextRow, reminders: createdReminders });
        }),
        update: vi.fn().mockResolvedValue(existingRow),
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          createdNextRow = {
            id: 't2',
            ...data,
            completedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          createdTodos.push(createdNextRow);
          return Promise.resolve(createdNextRow);
        }),
      },
      reminder: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const r = { id: 'r2', ...data, sentAt: null, createdAt: new Date() };
          createdReminders.push(r);
          return Promise.resolve(r);
        }),
      },
    };

    const prisma = {
      todo: {
        findFirst: vi.fn().mockResolvedValue({ id: 't1' }),
      },
      $transaction: vi.fn().mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx)),
    } as unknown as PrismaService;

    // 首次读取 prev 应返回未完成状态
    tx.todo.findUniqueOrThrow
      .mockResolvedValueOnce(existingRow)
      .mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === 't1') return Promise.resolve({ ...existingRow, completedAt: new Date() });
        return Promise.resolve({ ...createdNextRow, reminders: createdReminders });
      });

    const service = new TodoService(prisma);
    const res = await service.setCompleted('u1', 't1', true);

    expect(res.completedAt).not.toBeNull();
    expect(res.nextTodo).toBeDefined();
    expect(res.nextTodo?.id).toBe('t2');
    expect(res.nextTodo?.repeat).toBe('weekly');
    expect(createdTodos).toHaveLength(1);
    expect(createdReminders).toHaveLength(1);
    expect((createdNextRow!.dueAt as Date).getTime()).toBeGreaterThan(due.getTime());
  });
});

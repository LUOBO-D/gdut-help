import { Injectable } from '@nestjs/common';
import { ErrorCode, reminderFireAt, todoInputSchema, type Todo } from '@gduthelp/shared';
import type { z } from 'zod';
import { AppException } from '../common/app.exception.js';
import type { Prisma, Reminder, Todo as TodoRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type TodoData = z.output<typeof todoInputSchema>;
type Tx = Prisma.TransactionClient;

/** 提醒时间已经过去超过这么久就不再创建 */
const PAST_GRACE_MS = 60_000;
/** 已完成的待办在列表里保留几天 */
const DONE_KEEP_DAYS = 7;

const toTodo = (t: TodoRow & { reminders: Reminder[] }): Todo => ({
  id: t.id,
  title: t.title,
  note: t.note,
  dueAt: t.dueAt?.toISOString() ?? null,
  priority: t.priority,
  completedAt: t.completedAt?.toISOString() ?? null,
  createdAt: t.createdAt.toISOString(),
  reminders: t.reminders
    .map((r) => ({ id: r.id, offsetMinutes: r.offsetMinutes, fireAt: r.fireAt.toISOString(), status: r.status }))
    .sort((a, b) => a.fireAt.localeCompare(b.fireAt)),
});

@Injectable()
export class TodoService {
  constructor(private readonly prisma: PrismaService) {}

  /** 未完成的全部 + 最近 7 天完成的 */
  async list(userId: string): Promise<Todo[]> {
    const since = new Date(Date.now() - DONE_KEEP_DAYS * 24 * 3600_000);
    const rows = await this.prisma.todo.findMany({
      where: { userId, OR: [{ completedAt: null }, { completedAt: { gte: since } }] },
      include: { reminders: true },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: 300,
    });
    return rows.map(toTodo);
  }

  async create(userId: string, data: TodoData): Promise<Todo> {
    const row = await this.prisma.$transaction(async (tx) => {
      const todo = await tx.todo.create({ data: { userId, ...this.fields(data) } });
      await this.rebuildReminders(tx, todo, data.reminders);
      return tx.todo.findUniqueOrThrow({ where: { id: todo.id }, include: { reminders: true } });
    });
    return toTodo(row);
  }

  async update(userId: string, id: string, data: TodoData): Promise<Todo> {
    await this.owned(userId, id);
    const row = await this.prisma.$transaction(async (tx) => {
      const todo = await tx.todo.update({ where: { id }, data: this.fields(data) });
      await this.rebuildReminders(tx, todo, data.reminders);
      return tx.todo.findUniqueOrThrow({ where: { id }, include: { reminders: true } });
    });
    return toTodo(row);
  }

  async setCompleted(userId: string, id: string, completed: boolean): Promise<Todo> {
    await this.owned(userId, id);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.todo.update({ where: { id }, data: { completedAt: completed ? new Date() : null } });
      if (completed) {
        await tx.reminder.updateMany({ where: { todoId: id, status: 'pending' }, data: { status: 'cancelled' } });
      } else {
        // 重新打开时，恢复还没到时间的提醒
        await tx.reminder.updateMany({
          where: { todoId: id, status: 'cancelled', fireAt: { gt: new Date() } },
          data: { status: 'pending' },
        });
      }
      return tx.todo.findUniqueOrThrow({ where: { id }, include: { reminders: true } });
    });
    return toTodo(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.prisma.todo.delete({ where: { id } });
  }

  private fields(data: TodoData) {
    return {
      title: data.title,
      note: data.note ?? null,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
      priority: data.priority,
    };
  }

  /**
   * 按新的设置重建提醒：删除未发送的，保留已发送的作为记录。
   * 已发送过的时间点不会重复创建，所以修改待办的其他内容不会导致重复提醒。
   */
  private async rebuildReminders(tx: Tx, todo: TodoRow, specs: TodoData['reminders']) {
    await tx.reminder.deleteMany({ where: { todoId: todo.id, status: { in: ['pending', 'cancelled'] } } });
    const sent = await tx.reminder.findMany({ where: { todoId: todo.id, status: 'sent' }, select: { fireAt: true } });
    const taken = new Set(sent.map((r) => r.fireAt.getTime()));
    const dueAt = todo.dueAt?.toISOString() ?? null;
    const earliest = Date.now() - PAST_GRACE_MS;

    for (const spec of specs) {
      const fireAt = reminderFireAt(spec, dueAt);
      if (!fireAt || fireAt.getTime() < earliest || taken.has(fireAt.getTime())) continue;
      taken.add(fireAt.getTime());
      await tx.reminder.create({
        data: {
          todoId: todo.id,
          userId: todo.userId,
          offsetMinutes: 'offsetMinutes' in spec ? spec.offsetMinutes : null,
          fireAt,
          status: todo.completedAt ? 'cancelled' : 'pending',
        },
      });
    }
  }

  private async owned(userId: string, id: string) {
    const t = await this.prisma.todo.findFirst({ where: { id, userId }, select: { id: true } });
    if (!t) throw new AppException(ErrorCode.NOT_FOUND, '待办不存在', 404);
  }
}

import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  SELECTION_KINDS,
  type CourseSelectionInput,
  type CourseSelectionReminder,
  type CourseSelectionSyncRequest,
  type SelectionKind,
} from '@gduthelp/shared';
import { AppException } from '../common/app.exception.js';
import type { CourseSelectionReminder as ReminderRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const toKind = (raw: string): SelectionKind =>
  (SELECTION_KINDS as readonly string[]).includes(raw) ? (raw as SelectionKind) : 'other';

const toReminder = (row: ReminderRow): CourseSelectionReminder => ({
  id: row.id,
  title: row.title,
  kind: toKind(row.kind),
  startAt: row.startAt.toISOString(),
  endAt: row.endAt ? row.endAt.toISOString() : null,
  enabled: row.enabled,
  leadMinutes: [...row.leadMinutes].sort((a, b) => b - a),
  note: row.note,
  source: row.source === 'jw' ? 'jw' : 'manual',
  createdAt: row.createdAt.toISOString(),
});

@Injectable()
export class CourseSelectionService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<CourseSelectionReminder[]> {
    const rows = await this.prisma.courseSelectionReminder.findMany({
      where: { userId },
      orderBy: [{ startAt: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map(toReminder);
  }

  async create(userId: string, input: CourseSelectionInput): Promise<CourseSelectionReminder> {
    const row = await this.prisma.courseSelectionReminder.create({
      data: {
        userId,
        title: input.title,
        kind: input.kind,
        startAt: new Date(input.startAt),
        endAt: input.endAt ? new Date(input.endAt) : null,
        enabled: input.enabled,
        leadMinutes: [...new Set(input.leadMinutes)].sort((a, b) => b - a),
        note: input.note,
        source: input.source,
      },
    });
    return toReminder(row);
  }

  async update(userId: string, id: string, input: CourseSelectionInput): Promise<CourseSelectionReminder> {
    const existing = await this.prisma.courseSelectionReminder.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) throw new AppException(ErrorCode.NOT_FOUND, '选课提醒不存在', 404);
    const row = await this.prisma.courseSelectionReminder.update({
      where: { id },
      data: {
        title: input.title,
        kind: input.kind,
        startAt: new Date(input.startAt),
        endAt: input.endAt ? new Date(input.endAt) : null,
        enabled: input.enabled,
        leadMinutes: [...new Set(input.leadMinutes)].sort((a, b) => b - a),
        note: input.note,
      },
    });
    return toReminder(row);
  }

  async sync(userId: string, body: CourseSelectionSyncRequest): Promise<{ added: number; total: number }> {
    const existing = await this.prisma.courseSelectionReminder.findMany({
      where: { userId },
      select: { title: true, startAt: true },
    });
    const keys = new Set(existing.map((e) => `${e.title}|${e.startAt.toISOString()}`));
    let added = 0;

    for (const item of body.items) {
      const startIso = new Date(item.startAt).toISOString();
      const key = `${item.title}|${startIso}`;
      if (keys.has(key)) continue;
      keys.add(key);
      await this.create(userId, { ...item, source: 'jw' });
      added += 1;
    }

    const total = await this.prisma.courseSelectionReminder.count({ where: { userId } });
    return { added, total };
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.courseSelectionReminder.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) throw new AppException(ErrorCode.NOT_FOUND, '选课提醒不存在', 404);
    await this.prisma.courseSelectionReminder.delete({ where: { id } });
  }
}

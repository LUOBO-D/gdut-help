import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { CourseSelectionService } from './course-selection.service.js';

describe('CourseSelectionService', () => {
  it('deduplicates synced selection windows by title and startAt', async () => {
    const startIso = '2026-12-21T04:30:00.000Z';
    const findMany = vi.fn().mockResolvedValue([{ title: '公选正选', startAt: new Date(startIso) }]);
    const create = vi.fn().mockResolvedValue({
      id: 'r2',
      userId: 'u1',
      title: '体育选课',
      kind: 'pe',
      startAt: new Date('2026-12-22T04:30:00.000Z'),
      endAt: null,
      enabled: true,
      leadMinutes: [1440, 30, 5],
      note: null,
      source: 'jw',
      createdAt: new Date('2026-12-01T00:00:00Z'),
      updatedAt: new Date('2026-12-01T00:00:00Z'),
    });
    const count = vi.fn().mockResolvedValue(2);

    const prisma = {
      courseSelectionReminder: { findMany, create, count },
    } as unknown as PrismaService;

    const service = new CourseSelectionService(prisma);
    const res = await service.sync('u1', {
      items: [
        {
          title: '公选正选',
          kind: 'elective',
          startAt: startIso,
          endAt: null,
          enabled: true,
          leadMinutes: [30, 5],
          note: null,
          source: 'jw',
        },
        {
          title: '体育选课',
          kind: 'pe',
          startAt: '2026-12-22T12:30:00+08:00',
          endAt: null,
          enabled: true,
          leadMinutes: [1440, 30, 5],
          note: null,
          source: 'jw',
        },
      ],
    });

    expect(res).toEqual({ added: 1, total: 2 });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

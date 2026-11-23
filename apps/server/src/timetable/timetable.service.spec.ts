import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TimetableService } from './timetable.service.js';

describe('TimetableService.findEmptyRooms', () => {
  it('excludes occupied rooms for the requested slot and ignores non-classroom locations', async () => {
    const prisma = {
      semester: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'sem-1',
          name: '2026-2027-1',
          startDate: new Date('2026-09-07T00:00:00Z'),
          totalWeeks: 20,
          isCurrent: true,
        }),
      },
      courseSlot: {
        findMany: vi.fn().mockResolvedValue([
          // Occupied in week 10, Mon 1-2
          {
            weekday: 1,
            periodStart: 1,
            periodEnd: 2,
            weeks: [1, 10, 12],
            location: '教3-305',
            course: { location: null },
          },
          // Free in week 10, Mon 1-2 (only used on Wed)
          {
            weekday: 3,
            periodStart: 1,
            periodEnd: 2,
            weeks: [1, 10],
            location: '教1-202',
            course: { location: null },
          },
          // Free in week 10, Mon 1-2 (used in week 10 Mon 3-4, no overlap)
          {
            weekday: 1,
            periodStart: 3,
            periodEnd: 4,
            weeks: [10],
            location: null,
            course: { location: '教4-101' },
          },
          // Non-classroom locations should be ignored
          {
            weekday: 2,
            periodStart: 1,
            periodEnd: 2,
            weeks: [10],
            location: '西区田径场',
            course: { location: null },
          },
          {
            weekday: 2,
            periodStart: 3,
            periodEnd: 4,
            weeks: [10],
            location: '线上腾讯会议',
            course: { location: null },
          },
        ]),
      },
    } as unknown as PrismaService;

    const service = new TimetableService(prisma);
    const res = await service.findEmptyRooms({ week: 10, weekday: 1, periodStart: 1, periodEnd: 2 });

    expect(res.source).toBe('timetable');
    expect(res.totalKnownRooms).toBe(3);
    expect(res.occupiedCount).toBe(1);
    expect(res.rooms.map((r) => r.name)).toEqual(['教1-202', '教4-101']);
    expect(res.rooms[0]?.building).toBe('教1');
    expect(res.rooms[1]?.building).toBe('教4');
  });
});

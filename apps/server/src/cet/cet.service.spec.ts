import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { CetService } from './cet.service.js';

describe('CetService', () => {
  it('syncs CET records by upserting unique (userId, level, examSession)', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-1' });
    const upsert = vi.fn().mockResolvedValue({
      id: 'c1',
      userId: 'u1',
      level: 'cet4',
      examSession: '2026年6月',
      totalScore: 530,
      listening: 180,
      reading: 195,
      writing: 155,
      oralGrade: null,
      ticketNo: null,
      source: 'jw',
      note: null,
      createdAt: new Date('2026-08-25T00:00:00Z'),
      updatedAt: new Date('2026-08-25T00:00:00Z'),
    });
    const count = vi.fn().mockResolvedValue(2);

    const prisma = {
      cetRecord: { findUnique, upsert, count },
    } as unknown as PrismaService;

    const service = new CetService(prisma);
    const res = await service.sync('u1', {
      records: [
        {
          level: 'cet4',
          examSession: '2026年6月',
          totalScore: 530,
          listening: 180,
          reading: 195,
          writing: 155,
          oralGrade: null,
          ticketNo: null,
          note: null,
        },
        {
          level: 'cet6',
          examSession: '2026年6月',
          totalScore: 460,
          listening: null,
          reading: null,
          writing: null,
          oralGrade: null,
          ticketNo: null,
          note: null,
        },
      ],
    });

    expect(res).toEqual({ added: 1, updated: 1, total: 2 });
    expect(upsert).toHaveBeenCalledTimes(2);
  });
});

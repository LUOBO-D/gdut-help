import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { FitnessService } from './fitness.service.js';

function makeRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-11-22T00:00:00.000Z');
  return {
    id: '00000000-0000-0000-0000-000000000010',
    userId: 'u1',
    academicYear: '2025-2026',
    gradeYear: 2,
    gender: 'male',
    heightCm: 175,
    weightKg: 65,
    lungCapacityMl: 4400,
    sprint50mSec: 7.2,
    sitAndReachCm: 16.5,
    standingLongJumpCm: 245,
    strengthCount: 14,
    enduranceSec: 225,
    exempt: false,
    officialTotal: null,
    testedAt: '2025-11-10',
    note: null,
    source: 'manual',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeHarness() {
  const fitnessRecord = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const prisma = {
    fitnessRecord,
    $transaction: vi.fn(async (fn: (tx: { fitnessRecord: typeof fitnessRecord }) => Promise<unknown>) =>
      fn({ fitnessRecord }),
    ),
  };
  return { service: new FitnessService(prisma as unknown as PrismaService), prisma, fitnessRecord };
}

describe('FitnessService', () => {
  it('同一学年重复创建手动记录时返回 CONFLICT 提示', async () => {
    const { service, fitnessRecord } = makeHarness();
    fitnessRecord.findUnique.mockResolvedValue({ id: 'existing-id' });

    await expect(
      service.create('u1', {
        academicYear: '2025-2026',
        gradeYear: 2,
        gender: 'male',
        heightCm: 175,
        weightKg: 65,
        lungCapacityMl: 4400,
        sprint50mSec: 7.2,
        sitAndReachCm: 16.5,
        standingLongJumpCm: 245,
        strengthCount: 14,
        enduranceSec: 225,
        exempt: false,
        officialTotal: null,
        testedAt: null,
        note: null,
      }),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_FAILED' });
  });

  it('批量导入按学年幂等增量更新（新增缺省学年、更新变化学年、跳过无变化学年）', async () => {
    const { service, fitnessRecord } = makeHarness();
    fitnessRecord.findMany.mockResolvedValue([
      makeRow({ id: 'id-y1', academicYear: '2024-2025', gradeYear: 1, lungCapacityMl: 4200 }),
      makeRow({ id: 'id-y2', academicYear: '2025-2026', gradeYear: 2, lungCapacityMl: 4400 }),
    ]);
    fitnessRecord.create.mockResolvedValue(makeRow({ id: 'id-y3', academicYear: '2026-2027', gradeYear: 3 }));
    fitnessRecord.update.mockResolvedValue(makeRow({ id: 'id-y1', academicYear: '2024-2025', lungCapacityMl: 4500 }));

    const result = await service.importRecords('u1', {
      records: [
        {
          academicYear: '2024-2025',
          gradeYear: 1,
          gender: 'male',
          heightCm: 175,
          weightKg: 65,
          lungCapacityMl: 4500, // changed
          sprint50mSec: 7.2,
          sitAndReachCm: 16.5,
          standingLongJumpCm: 245,
          strengthCount: 14,
          enduranceSec: 225,
          exempt: false,
          officialTotal: null,
          testedAt: '2025-11-10',
          note: null,
        },
        {
          academicYear: '2025-2026',
          gradeYear: 2,
          gender: 'male',
          heightCm: 175,
          weightKg: 65,
          lungCapacityMl: 4400, // unchanged
          sprint50mSec: 7.2,
          sitAndReachCm: 16.5,
          standingLongJumpCm: 245,
          strengthCount: 14,
          enduranceSec: 225,
          exempt: false,
          officialTotal: null,
          testedAt: '2025-11-10',
          note: null,
        },
        {
          academicYear: '2026-2027',
          gradeYear: 3,
          gender: 'male',
          heightCm: 176,
          weightKg: 66,
          lungCapacityMl: 4600,
          sprint50mSec: 7.1,
          sitAndReachCm: 18,
          standingLongJumpCm: 250,
          strengthCount: 16,
          enduranceSec: 220,
          exempt: false,
          officialTotal: null,
          testedAt: null,
          note: null,
        },
      ],
    });

    expect(result).toEqual({ added: 1, changed: 1, unchanged: 1 });
    expect(fitnessRecord.create).toHaveBeenCalledTimes(1);
    expect(fitnessRecord.update).toHaveBeenCalledTimes(1);
  });

  it('删除他人或不存在的体测记录时返回 NOT_FOUND', async () => {
    const { service, fitnessRecord } = makeHarness();
    fitnessRecord.findFirst.mockResolvedValue(null);

    await expect(service.remove('u1', '00000000-0000-0000-0000-000000000099')).rejects.toMatchObject({
      errorCode: 'NOT_FOUND',
    });
  });

  it('只查询与幂等覆盖当前学年体测成绩（getCurrent / upsertCurrent）', async () => {
    const { service, fitnessRecord } = makeHarness();
    fitnessRecord.findUnique.mockResolvedValue(makeRow({ academicYear: '2026-2027', gradeYear: 3 }));
    const cur = await service.getCurrent('u1', '2026-2027');
    expect(cur.academicYear).toBe('2026-2027');
    expect(cur.record?.gradeYear).toBe(3);
    expect(cur.syncedAt).toBeTruthy();

    fitnessRecord.upsert.mockResolvedValue(makeRow({ academicYear: '2026-2027', source: 'import' }));
    const saved = await service.upsertCurrent(
      'u1',
      {
        academicYear: '2026-2027',
        gradeYear: 3,
        gender: 'male',
        heightCm: 175,
        weightKg: 65,
        lungCapacityMl: 4500,
        sprint50mSec: 7.1,
        sitAndReachCm: 17,
        standingLongJumpCm: 248,
        strengthCount: 15,
        enduranceSec: 220,
        exempt: false,
        officialTotal: null,
        testedAt: null,
        note: null,
      },
      'import',
    );
    expect(saved.source).toBe('import');
    expect(fitnessRecord.upsert).toHaveBeenCalledTimes(1);
  });
});

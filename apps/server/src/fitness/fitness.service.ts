import { HttpStatus, Injectable } from '@nestjs/common';
import {
  defaultAcademicYear,
  diffFitnessImport,
  ErrorCode,
  fitnessImportSchema,
  fitnessRecordInputSchema,
  type CurrentFitnessData,
  type FitnessData,
  type FitnessGradeYear,
  type FitnessImportResult,
  type FitnessRecord,
  type FitnessSource,
} from '@gduthelp/shared';
import type { z } from 'zod';
import { AppException } from '../common/app.exception.js';
import type { FitnessRecord as FitnessRecordRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type FitnessRecordInputData = z.output<typeof fitnessRecordInputSchema>;
type FitnessImportData = z.output<typeof fitnessImportSchema>;

const toFitnessRecord = (r: FitnessRecordRow): FitnessRecord => ({
  id: r.id,
  academicYear: r.academicYear,
  gradeYear: Math.min(4, Math.max(1, r.gradeYear)) as FitnessGradeYear,
  gender: r.gender,
  heightCm: r.heightCm,
  weightKg: r.weightKg,
  lungCapacityMl: r.lungCapacityMl,
  sprint50mSec: r.sprint50mSec,
  sitAndReachCm: r.sitAndReachCm,
  standingLongJumpCm: r.standingLongJumpCm,
  strengthCount: r.strengthCount,
  enduranceSec: r.enduranceSec,
  exempt: r.exempt,
  officialTotal: r.officialTotal,
  testedAt: r.testedAt,
  note: r.note,
  source: r.source,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

function toDbPayload(data: FitnessRecordInputData) {
  return {
    academicYear: data.academicYear,
    gradeYear: data.gradeYear,
    gender: data.gender,
    heightCm: data.heightCm,
    weightKg: data.weightKg,
    lungCapacityMl: data.lungCapacityMl,
    sprint50mSec: data.sprint50mSec,
    sitAndReachCm: data.sitAndReachCm,
    standingLongJumpCm: data.standingLongJumpCm,
    strengthCount: data.strengthCount,
    enduranceSec: data.enduranceSec,
    exempt: data.exempt,
    officialTotal: data.officialTotal,
    testedAt: data.testedAt,
    note: data.note,
  };
}

@Injectable()
export class FitnessService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<FitnessData> {
    const rows = await this.prisma.fitnessRecord.findMany({
      where: { userId },
      orderBy: [{ academicYear: 'desc' }, { gradeYear: 'desc' }],
    });
    return { records: rows.map(toFitnessRecord) };
  }

  /** 查询当前学年的体测成绩（聚焦本学年，不再堆叠往年记录） */
  async getCurrent(userId: string, academicYear: string = defaultAcademicYear()): Promise<CurrentFitnessData> {
    const row = await this.prisma.fitnessRecord.findUnique({
      where: { userId_academicYear: { userId, academicYear } },
    });
    return {
      academicYear,
      record: row ? toFitnessRecord(row) : null,
      syncedAt: row ? row.updatedAt.toISOString() : null,
    };
  }

  /** 幂等保存/覆盖当前学年体测成绩（支持直连查询自动更新与手动修改） */
  async upsertCurrent(
    userId: string,
    data: FitnessRecordInputData,
    source: FitnessSource = 'manual',
  ): Promise<FitnessRecord> {
    const payload = toDbPayload(data);
    const row = await this.prisma.fitnessRecord.upsert({
      where: { userId_academicYear: { userId, academicYear: data.academicYear } },
      create: {
        userId,
        ...payload,
        source,
      },
      update: {
        ...payload,
        source,
      },
    });
    return toFitnessRecord(row);
  }

  async create(userId: string, data: FitnessRecordInputData): Promise<FitnessRecord> {
    const existing = await this.prisma.fitnessRecord.findUnique({
      where: { userId_academicYear: { userId, academicYear: data.academicYear } },
      select: { id: true },
    });
    if (existing) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `${data.academicYear} 学年已有体测记录，请直接编辑该学年记录`,
        HttpStatus.CONFLICT,
      );
    }

    const row = await this.prisma.fitnessRecord.create({
      data: {
        userId,
        ...toDbPayload(data),
        source: 'manual',
      },
    });
    return toFitnessRecord(row);
  }

  async update(userId: string, id: string, data: FitnessRecordInputData): Promise<FitnessRecord> {
    const current = await this.owned(userId, id);
    if (current.academicYear !== data.academicYear) {
      const clash = await this.prisma.fitnessRecord.findUnique({
        where: { userId_academicYear: { userId, academicYear: data.academicYear } },
        select: { id: true },
      });
      if (clash && clash.id !== id) {
        throw new AppException(
          ErrorCode.VALIDATION_FAILED,
          `${data.academicYear} 学年已存在体测记录，无法重复占用该学年`,
          HttpStatus.CONFLICT,
        );
      }
    }

    const row = await this.prisma.fitnessRecord.update({
      where: { id },
      data: toDbPayload(data),
    });
    return toFitnessRecord(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.prisma.fitnessRecord.delete({ where: { id } });
  }

  /**
   * 幂等批量导入历年体测成绩：
   * 按学年（academicYear）比对差异，新增缺失学年、更新发生变化的学年，不删除未出现在本次导入里的历史学年。
   */
  async importRecords(userId: string, data: FitnessImportData): Promise<FitnessImportResult> {
    const seenYears = new Set<string>();
    for (const item of data.records) {
      if (seenYears.has(item.academicYear)) {
        throw new AppException(ErrorCode.VALIDATION_FAILED, `导入数据中存在重复学年：${item.academicYear}`);
      }
      seenYears.add(item.academicYear);
    }

    return this.prisma.$transaction(async (tx) => {
      const existingRows = await tx.fitnessRecord.findMany({ where: { userId } });
      const diff = diffFitnessImport(existingRows.map(toFitnessRecord), data.records);

      for (const item of diff.added) {
        await tx.fitnessRecord.create({
          data: {
            userId,
            ...toDbPayload(item),
            source: 'import',
          },
        });
      }

      for (const { before, after } of diff.changed) {
        await tx.fitnessRecord.update({
          where: { id: before.id },
          data: {
            ...toDbPayload(after),
            source: 'import',
          },
        });
      }

      return {
        added: diff.added.length,
        changed: diff.changed.length,
        unchanged: diff.unchanged,
      };
    });
  }

  private async owned(userId: string, id: string): Promise<{ id: string; academicYear: string }> {
    const row = await this.prisma.fitnessRecord.findFirst({
      where: { id, userId },
      select: { id: true, academicYear: true },
    });
    if (!row) throw new AppException(ErrorCode.NOT_FOUND, '体测记录不存在', HttpStatus.NOT_FOUND);
    return row;
  }
}

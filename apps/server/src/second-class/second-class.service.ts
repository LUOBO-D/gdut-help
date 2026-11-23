import { HttpStatus, Injectable } from '@nestjs/common';
import {
  academicYearOfSemester,
  defaultAcademicYear,
  defaultSemesterCode,
  ErrorCode,
  formatSemesterName,
  inferSemesterCodeFromDate,
  normalizeSemesterCode,
  secondClassRecordInputSchema,
  secondClassSyncSchema,
  secondClassTargetsSchema,
  summarizeSecondClass,
  type SecondClassRecord,
  type SecondClassSummaryResponse,
  type SecondClassSyncResult,
} from '@gduthelp/shared';
import type { z } from 'zod';
import { AppException } from '../common/app.exception.js';
import type { SecondClassRecord as SecondClassRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type SecondClassInputData = z.output<typeof secondClassRecordInputSchema>;
type SecondClassSyncData = z.output<typeof secondClassSyncSchema>;
type SecondClassTargetsData = z.output<typeof secondClassTargetsSchema>;

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

const toRecord = (r: SecondClassRow): SecondClassRecord => ({
  id: r.id,
  academicYear: r.academicYear,
  semesterCode: r.semesterCode,
  semesterName: formatSemesterName(r.semesterCode),
  title: r.title,
  category: r.category,
  hours: r.hours,
  credits: r.credits,
  activityDate: r.activityDate,
  organizer: r.organizer,
  status: r.status,
  source: r.source,
  importKey: r.importKey,
  note: r.note,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

@Injectable()
export class SecondClassService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    userId: string,
    opts?: { academicYear?: string; semesterCode?: string },
  ): Promise<SecondClassSummaryResponse> {
    const semesterCode = opts?.semesterCode ? normalizeSemesterCode(opts.semesterCode) : defaultSemesterCode();
    const academicYear = opts?.academicYear?.trim() || academicYearOfSemester(semesterCode) || defaultAcademicYear();

    const [plan, rows] = await Promise.all([
      this.prisma.userCreditPlan.findUnique({
        where: { userId },
        select: { secondClassSemesterTarget: true, secondClassYearTarget: true },
      }),
      this.prisma.secondClassRecord.findMany({
        where: { userId, academicYear },
        orderBy: [{ activityDate: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    const records = rows.map(toRecord);
    let syncedAt: string | null = null;
    for (const r of rows) {
      const iso = r.updatedAt.toISOString();
      if (!syncedAt || iso > syncedAt) syncedAt = iso;
    }

    return summarizeSecondClass(records, {
      academicYear,
      semesterCode,
      semesterTargetHours: plan?.secondClassSemesterTarget ?? 12,
      yearTargetHours: plan?.secondClassYearTarget ?? 24,
      syncedAt,
    });
  }

  async create(userId: string, data: SecondClassInputData): Promise<SecondClassRecord> {
    const semesterCode = data.semesterCode
      ? normalizeSemesterCode(data.semesterCode)
      : inferSemesterCodeFromDate(data.activityDate);
    const academicYear = academicYearOfSemester(semesterCode);

    const row = await this.prisma.secondClassRecord.create({
      data: {
        userId,
        academicYear,
        semesterCode,
        title: data.title,
        category: data.category,
        hours: round1(data.hours),
        credits: round2(data.credits),
        activityDate: data.activityDate,
        organizer: data.organizer,
        status: data.status,
        note: data.note,
        source: 'manual',
      },
    });
    return toRecord(row);
  }

  async update(userId: string, id: string, data: SecondClassInputData): Promise<SecondClassRecord> {
    await this.owned(userId, id);
    const semesterCode = data.semesterCode
      ? normalizeSemesterCode(data.semesterCode)
      : inferSemesterCodeFromDate(data.activityDate);
    const academicYear = academicYearOfSemester(semesterCode);

    const row = await this.prisma.secondClassRecord.update({
      where: { id },
      data: {
        academicYear,
        semesterCode,
        title: data.title,
        category: data.category,
        hours: round1(data.hours),
        credits: round2(data.credits),
        activityDate: data.activityDate,
        organizer: data.organizer,
        status: data.status,
        note: data.note,
      },
    });
    return toRecord(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.prisma.secondClassRecord.delete({ where: { id } });
  }

  async syncRecords(userId: string, data: SecondClassSyncData): Promise<SecondClassSyncResult> {
    return this.prisma.$transaction(async (tx) => {
      const existingRows = await tx.secondClassRecord.findMany({
        where: { userId, importKey: { not: null } },
      });
      const existingByKey = new Map<string, SecondClassRow>();
      for (const r of existingRows) {
        if (r.importKey) existingByKey.set(r.importKey, r);
      }

      let added = 0;
      let updated = 0;
      let unchanged = 0;

      for (const item of data.records) {
        const semesterCode = item.semesterCode
          ? normalizeSemesterCode(item.semesterCode)
          : inferSemesterCodeFromDate(item.activityDate);
        const academicYear = item.academicYear?.trim() || academicYearOfSemester(semesterCode);
        const hours = round1(item.hours);
        const credits = round2(item.credits);

        const prev = existingByKey.get(item.importKey);
        if (!prev) {
          await tx.secondClassRecord.create({
            data: {
              userId,
              academicYear,
              semesterCode,
              title: item.title,
              category: item.category,
              hours,
              credits,
              activityDate: item.activityDate,
              organizer: item.organizer,
              status: item.status,
              note: item.note,
              source: 'import',
              importKey: item.importKey,
            },
          });
          added += 1;
        } else if (
          prev.hours !== hours ||
          prev.credits !== credits ||
          prev.status !== item.status ||
          prev.category !== item.category ||
          prev.title !== item.title ||
          prev.semesterCode !== semesterCode
        ) {
          await tx.secondClassRecord.update({
            where: { id: prev.id },
            data: {
              academicYear,
              semesterCode,
              title: item.title,
              category: item.category,
              hours,
              credits,
              activityDate: item.activityDate,
              organizer: item.organizer,
              status: item.status,
              note: item.note,
            },
          });
          updated += 1;
        } else {
          unchanged += 1;
        }
      }

      return {
        added,
        updated,
        unchanged,
        total: data.records.length,
        syncedAt: new Date().toISOString(),
      };
    });
  }

  async updateTargets(
    userId: string,
    data: SecondClassTargetsData,
  ): Promise<{ semesterTargetHours: number; yearTargetHours: number }> {
    const semesterTargetHours = round1(data.semesterTargetHours);
    const yearTargetHours = round1(Math.max(semesterTargetHours, data.yearTargetHours));

    await this.prisma.userCreditPlan.upsert({
      where: { userId },
      create: {
        userId,
        secondClassSemesterTarget: semesterTargetHours,
        secondClassYearTarget: yearTargetHours,
      },
      update: {
        secondClassSemesterTarget: semesterTargetHours,
        secondClassYearTarget: yearTargetHours,
      },
    });
    return { semesterTargetHours, yearTargetHours };
  }

  private async owned(userId: string, id: string): Promise<void> {
    const row = await this.prisma.secondClassRecord.findFirst({ where: { id, userId }, select: { id: true } });
    if (!row) throw new AppException(ErrorCode.NOT_FOUND, '第二课堂记录不存在', HttpStatus.NOT_FOUND);
  }
}

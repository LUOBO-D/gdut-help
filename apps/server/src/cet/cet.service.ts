import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type CetRecord,
  type CetRecordInput,
  type CetSyncRequest,
  type CetSyncResult,
} from '@gduthelp/shared';
import { AppException } from '../common/app.exception.js';
import type { CetRecord as CetRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const toCetRecord = (row: CetRow): CetRecord => ({
  id: row.id,
  level: row.level,
  examSession: row.examSession,
  totalScore: row.totalScore,
  listening: row.listening,
  reading: row.reading,
  writing: row.writing,
  oralGrade: row.oralGrade,
  ticketNo: row.ticketNo,
  source: row.source === 'jw' ? 'jw' : 'manual',
  note: row.note,
  createdAt: row.createdAt.toISOString(),
});

@Injectable()
export class CetService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<CetRecord[]> {
    const rows = await this.prisma.cetRecord.findMany({
      where: { userId },
      orderBy: [{ examSession: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toCetRecord);
  }

  async upsert(
    userId: string,
    input: CetRecordInput,
    source: 'manual' | 'jw' = 'manual',
    skipCapCheck = false,
  ): Promise<CetRecord> {
    if (!skipCapCheck) {
      const existing = await this.prisma.cetRecord.findUnique({
        where: { userId_level_examSession: { userId, level: input.level, examSession: input.examSession } },
        select: { id: true },
      });
      if (!existing) {
        const count = await this.prisma.cetRecord.count({ where: { userId } });
        if (count >= 30) {
          throw new AppException(ErrorCode.VALIDATION_FAILED, '最多保存 30 条四六级成绩记录');
        }
      }
    }
    const row = await this.prisma.cetRecord.upsert({
      where: {
        userId_level_examSession: {
          userId,
          level: input.level,
          examSession: input.examSession,
        },
      },
      create: {
        userId,
        level: input.level,
        examSession: input.examSession,
        totalScore: input.totalScore,
        listening: input.listening,
        reading: input.reading,
        writing: input.writing,
        oralGrade: input.oralGrade,
        ticketNo: input.ticketNo,
        note: input.note,
        source,
      },
      update: {
        totalScore: input.totalScore,
        listening: input.listening,
        reading: input.reading,
        writing: input.writing,
        oralGrade: input.oralGrade,
        ticketNo: input.ticketNo,
        note: input.note,
        source,
      },
    });
    return toCetRecord(row);
  }

  async update(userId: string, id: string, input: CetRecordInput): Promise<CetRecord> {
    const existing = await this.prisma.cetRecord.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) throw new AppException(ErrorCode.NOT_FOUND, '四六级记录不存在', 404);
    const row = await this.prisma.cetRecord.update({
      where: { id },
      data: {
        level: input.level,
        examSession: input.examSession,
        totalScore: input.totalScore,
        listening: input.listening,
        reading: input.reading,
        writing: input.writing,
        oralGrade: input.oralGrade,
        ticketNo: input.ticketNo,
        note: input.note,
      },
    });
    return toCetRecord(row);
  }

  async sync(userId: string, body: CetSyncRequest): Promise<CetSyncResult> {
    let added = 0;
    let updated = 0;
    for (const item of body.records) {
      const existing = await this.prisma.cetRecord.findUnique({
        where: {
          userId_level_examSession: {
            userId,
            level: item.level,
            examSession: item.examSession,
          },
        },
        select: { id: true },
      });
      await this.upsert(userId, item, 'jw', true);
      if (existing) updated += 1;
      else added += 1;
    }
    const total = await this.prisma.cetRecord.count({ where: { userId } });
    return { added, updated, total };
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.cetRecord.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) throw new AppException(ErrorCode.NOT_FOUND, '四六级记录不存在', 404);
    await this.prisma.cetRecord.delete({ where: { id } });
  }
}

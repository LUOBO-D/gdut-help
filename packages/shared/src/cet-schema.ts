import { z } from 'zod';
import { CET_LEVELS, CET_MAX_TOTAL } from './cet.js';

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null));

const optionalPartScore = (max: number) =>
  z.number().int().min(0).max(max).nullable().optional().transform((v) => v ?? null);

export const cetRecordInputSchema = z.object({
  level: z.enum(CET_LEVELS),
  examSession: z.string().trim().min(2, { error: '请填写考次（如 2026年6月）' }).max(32),
  totalScore: z
    .number({ error: '请填写总分' })
    .int()
    .min(0, { error: '分数不能为负' })
    .max(CET_MAX_TOTAL, { error: `总分不超过 ${CET_MAX_TOTAL}` }),
  listening: optionalPartScore(249),
  reading: optionalPartScore(249),
  writing: optionalPartScore(213),
  oralGrade: optionalTrimmed(8),
  ticketNo: optionalTrimmed(32),
  note: optionalTrimmed(120),
});

export type CetRecordInput = z.infer<typeof cetRecordInputSchema>;

export const cetSyncSchema = z.object({
  records: z.array(cetRecordInputSchema).max(40, { error: '单次最多同步 40 条四六级记录' }),
});

export type CetSyncRequest = z.infer<typeof cetSyncSchema>;

export interface CetSyncResult {
  added: number;
  updated: number;
  total: number;
}

import { z } from 'zod';
import { SECOND_CLASS_CATEGORIES, SECOND_CLASS_STATUSES } from './second-class.js';

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null));

export const secondClassRecordInputSchema = z.object({
  title: z.string().trim().min(1, { error: '请填写活动或项目名称' }).max(100, { error: '名称最多 100 字' }),
  category: z.enum(SECOND_CLASS_CATEGORIES),
  hours: z.number({ error: '时长需为数字' }).min(0.5, { error: '时长至少 0.5 小时' }).max(200, { error: '单次时长不超过 200 小时' }),
  credits: z.number().min(0).max(20).optional().default(0),
  activityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: '活动日期格式应为 YYYY-MM-DD' }),
  semesterCode: z.string().trim().min(4).max(20).optional(),
  organizer: optionalTrimmed(60),
  status: z.enum(SECOND_CLASS_STATUSES).optional().default('approved'),
  note: optionalTrimmed(200),
});

export type SecondClassRecordInput = z.infer<typeof secondClassRecordInputSchema>;

export const secondClassSyncItemSchema = secondClassRecordInputSchema.extend({
  academicYear: z.string().trim().min(4).max(20).optional(),
  importKey: z.string().trim().min(1).max(120),
});

export const secondClassSyncSchema = z.object({
  records: z.array(secondClassSyncItemSchema).max(300, { error: '单次最多同步 300 条第二课堂记录' }),
});

export type SecondClassSyncRequest = z.infer<typeof secondClassSyncSchema>;

export interface SecondClassSyncResult {
  added: number;
  updated: number;
  unchanged: number;
  total: number;
  syncedAt: string;
}

export const secondClassTargetsSchema = z.object({
  semesterTargetHours: z.number().min(1).max(200),
  yearTargetHours: z.number().min(1).max(400),
});

export type SecondClassTargetsInput = z.infer<typeof secondClassTargetsSchema>;

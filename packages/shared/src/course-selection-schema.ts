import { z } from 'zod';
import { DEFAULT_SELECTION_LEADS, SELECTION_KINDS } from './course-selection.js';

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null));

const isoDatetime = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), { error: '时间格式无效' });

export const courseSelectionInputSchema = z.object({
  title: z.string().trim().min(1, { error: '请填写选课轮次名称' }).max(60, { error: '名称最多 60 字' }),
  kind: z.enum(SELECTION_KINDS).optional().default('elective'),
  startAt: isoDatetime,
  endAt: isoDatetime.nullable().optional().transform((v) => v ?? null),
  enabled: z.boolean().optional().default(true),
  leadMinutes: z
    .array(z.number().int().min(1).max(10_080))
    .max(6)
    .optional()
    .default([...DEFAULT_SELECTION_LEADS]),
  note: optionalTrimmed(160),
  source: z.enum(['manual', 'jw']).optional().default('manual'),
});

export type CourseSelectionInput = z.infer<typeof courseSelectionInputSchema>;

export const courseSelectionSyncSchema = z.object({
  items: z.array(courseSelectionInputSchema).max(20, { error: '单次最多同步 20 条选课时间' }),
});

export type CourseSelectionSyncRequest = z.infer<typeof courseSelectionSyncSchema>;

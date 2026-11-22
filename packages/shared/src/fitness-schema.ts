import { z } from 'zod';
import { FITNESS_GENDERS } from './fitness.js';

const academicYearRe = /^\d{4}-\d{4}$/;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const optionalFloat = (min: number, max: number, label: string) =>
  z
    .number({ error: `${label}需为数字` })
    .min(min, { error: `${label}不能小于 ${min}` })
    .max(max, { error: `${label}不能大于 ${max}` })
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? null : v));

const optionalInt = (min: number, max: number, label: string) =>
  z
    .number({ error: `${label}需为整数` })
    .int({ error: `${label}需为整数` })
    .min(min, { error: `${label}不能小于 ${min}` })
    .max(max, { error: `${label}不能大于 ${max}` })
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? null : v));

export const fitnessRecordInputSchema = z.object({
  academicYear: z
    .string()
    .trim()
    .regex(academicYearRe, { error: '学年格式应为 YYYY-YYYY（如 2025-2026）' })
    .refine(
      (v) => {
        const [a, b] = v.split('-').map(Number) as [number, number];
        return a >= 2015 && a <= 2040 && b === a + 1;
      },
      { error: '学年起止年份应相差 1 年（如 2025-2026）' },
    ),
  gradeYear: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  gender: z.enum(FITNESS_GENDERS),
  heightCm: optionalFloat(100, 250, '身高'),
  weightKg: optionalFloat(25, 200, '体重'),
  lungCapacityMl: optionalInt(500, 10000, '肺活量'),
  sprint50mSec: optionalFloat(5, 25, '50米跑'),
  sitAndReachCm: optionalFloat(-30, 50, '坐位体前屈'),
  standingLongJumpCm: optionalInt(50, 380, '立定跳远'),
  strengthCount: optionalInt(0, 150, '力量项目次数'),
  enduranceSec: optionalInt(90, 900, '长跑用时'),
  exempt: z.boolean().optional().default(false),
  officialTotal: optionalFloat(0, 120, '官方总分'),
  testedAt: z
    .string()
    .trim()
    .regex(dateRe, { error: '测试日期格式应为 YYYY-MM-DD' })
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  note: z
    .string()
    .trim()
    .max(120, { error: '备注最多 120 字' })
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type FitnessRecordInput = z.infer<typeof fitnessRecordInputSchema>;

export const fitnessImportSchema = z.object({
  records: z
    .array(fitnessRecordInputSchema)
    .min(1, { error: '请至少导入 1 条体测记录' })
    .max(8, { error: '单次最多导入 8 条学年记录' }),
});

export type FitnessImportRequest = z.infer<typeof fitnessImportSchema>;

export interface FitnessImportResult {
  added: number;
  changed: number;
  unchanged: number;
}

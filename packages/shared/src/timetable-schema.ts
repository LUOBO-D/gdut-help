import { z } from 'zod';
import { MAX_PERIOD } from './gdut.js';
import { parseDate } from './time.js';

/**
 * 课表表单校验。和 timetable.ts 的纯逻辑分开：首页只用到逻辑，
 * 拆开后首屏不会因为模块顶层创建 schema 而把 zod 打包进来。
 */

export const MAX_WEEKS = 30;

/** 课程颜色，保证在所有天气主题上都清楚 */
export const COURSE_COLORS = ['#ff8a65', '#ffb74d', '#81c784', '#4dd0e1', '#64b5f6', '#9575cd', '#f06292', '#a1887f'] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: '日期格式应为 YYYY-MM-DD' });

export const semesterInputSchema = z.object({
  name: z.string().trim().min(1).max(30),
  startDate: isoDate.refine((d) => parseDate(d).weekday === 1, { error: '开学日期需要是第 1 周的周一' }),
  totalWeeks: z.number().int().min(1).max(MAX_WEEKS),
});
export type SemesterInput = z.infer<typeof semesterInputSchema>;

const slotSchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    periodStart: z.number().int().min(1).max(MAX_PERIOD),
    periodEnd: z.number().int().min(1).max(MAX_PERIOD),
    weeks: z
      .array(z.number().int().min(1).max(MAX_WEEKS))
      .min(1, { error: '至少选择一周' })
      .transform((w) => [...new Set(w)].sort((a, b) => a - b)),
    location: z.string().trim().max(30).nullish(),
  })
  .refine((s) => s.periodEnd >= s.periodStart, { error: '结束节次不能早于开始节次', path: ['periodEnd'] });

export const courseInputSchema = z.object({
  name: z.string().trim().min(1, { error: '请填写课程名' }).max(30),
  teacher: z.string().trim().max(20).nullish(),
  location: z.string().trim().max(30).nullish(),
  color: z.enum(COURSE_COLORS, { error: '请选择课程颜色' }),
  slots: z.array(slotSchema).min(1, { error: '至少添加一个上课时间' }).max(10),
});
export type CourseInput = z.input<typeof courseInputSchema>;
export type CourseSlot = z.infer<typeof slotSchema>;


/** 导入课表的请求体：前端解析、预览后提交的课程列表 */
export const timetableImportSchema = z.object({
  courses: z
    .array(
      z.object({
        importKey: z.string().min(1).max(80),
        name: z.string().trim().min(1).max(30),
        teacher: z.string().trim().max(20).nullable(),
        location: z.string().trim().max(30).nullable(),
        slots: z.array(slotSchema).min(1).max(10),
      }),
    )
    .max(60),
  /** 以前导入、这次没有的课是否删除 */
  removeMissing: z.boolean().default(true),
});
export type TimetableImportRequest = z.input<typeof timetableImportSchema>;

export interface TimetableImportResult {
  added: number;
  changed: number;
  removed: number;
  unchanged: number;
}

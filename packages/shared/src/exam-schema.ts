import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: '考试日期格式应为 YYYY-MM-DD' });
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: '时间格式应为 HH:mm' });

const examFields = z.object({
  courseName: z.string().trim().min(1, { error: '请填写考试科目' }).max(50, { error: '科目名称最多 50 字' }),
  examDate: isoDate,
  startTime: hhmm,
  endTime: hhmm,
  location: z.string().trim().max(40).nullish(),
  seatNo: z.string().trim().max(20).nullish(),
  examType: z.string().trim().max(30).nullish(),
  campus: z.string().trim().max(30).nullish(),
  note: z.string().trim().max(120).nullish(),
});

export const examInputSchema = examFields.refine((e) => e.endTime > e.startTime, {
  error: '结束时间需晚于开始时间',
  path: ['endTime'],
});
export type ExamInput = z.input<typeof examInputSchema>;

export const examImportItemSchema = examFields
  .extend({
    importKey: z.string().trim().min(1).max(120),
  })
  .refine((e) => e.endTime > e.startTime, {
    error: '结束时间需晚于开始时间',
    path: ['endTime'],
  });

export const examImportSchema = z.object({
  exams: z.array(examImportItemSchema).max(60),
  /** 教务系统里已经没有的旧导入记录是否删除（不影响手动添加的考试） */
  removeMissing: z.boolean().default(true),
});
export type ExamImportRequest = z.input<typeof examImportSchema>;

export interface ExamImportResult {
  added: number;
  changed: number;
  removed: number;
  unchanged: number;
}

import { z } from 'zod';

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null));

export const courseGradeInputSchema = z.object({
  semesterCode: z.string().trim().min(1, { error: '请填写学期代码（如 202501）' }).max(20),
  semesterName: optionalTrimmed(40),
  courseCode: optionalTrimmed(40),
  courseName: z.string().trim().min(1, { error: '请填写课程名称' }).max(80, { error: '课程名称最多 80 字' }),
  credits: z
    .number({ error: '学分需为数字' })
    .min(0, { error: '学分不能为负数' })
    .max(30, { error: '单门学分不超过 30' }),
  scoreText: z.string().trim().min(1, { error: '请填写成绩（如 88 或 优秀）' }).max(20),
  gradePoint: z.number().min(0).max(5).nullable().optional(),
  courseType: optionalTrimmed(40),
  examType: optionalTrimmed(30),
});

export type CourseGradeInput = z.infer<typeof courseGradeInputSchema>;

export const gradeSyncItemSchema = courseGradeInputSchema.extend({
  importKey: z.string().trim().min(1).max(120),
});

export const gradeSyncSchema = z.object({
  grades: z.array(gradeSyncItemSchema).max(400, { error: '单次最多同步 400 门课程成绩' }),
  /** 全量同步时是否清理教务已删除的旧同步记录（手动添加的课程永远保留） */
  removeMissing: z.boolean().optional().default(false),
});

export type GradeSyncRequest = z.infer<typeof gradeSyncSchema>;

export interface GradeSyncResult {
  added: number;
  changed: number;
  removed: number;
  unchanged: number;
  total: number;
  syncedAt: string;
}

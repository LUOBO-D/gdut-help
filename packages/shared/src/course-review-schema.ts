import { z } from 'zod';
import {
  COURSE_ATTENDANCE_LEVELS,
  COURSE_EXAM_FORMATS,
  COURSE_SORT_OPTIONS,
  SHARED_COURSE_CATEGORIES,
} from './course-review.js';

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null));

const scoreField = z.number().int().min(1, { error: '评分需在 1–5 之间' }).max(5);

export const courseReviewInputSchema = z.object({
  scoreOverall: scoreField,
  scoreGrading: scoreField,
  scoreWorkload: scoreField,
  scoreQuality: scoreField,
  attendance: z.enum(COURSE_ATTENDANCE_LEVELS),
  examFormat: z.enum(COURSE_EXAM_FORMATS),
  semesterTaken: optionalTrimmed(30),
  tags: z.array(z.string().trim().min(1).max(16)).max(6, { error: '最多选 6 个标签' }).default([]),
  content: z
    .string()
    .trim()
    .min(2, { error: '请写几句真实选课感受（至少 2 字）' })
    .max(600, { error: '评价内容最多 600 字' }),
  anonymous: z.boolean().optional().default(false),
});

export type CourseReviewInput = z.infer<typeof courseReviewInputSchema>;

/** 一体化「投稿选修课 + 写评价」：仅限公共选修课与体育选课，同校区同课程同教师自动合并 */
export const createCourseAndReviewSchema = courseReviewInputSchema.extend({
  courseCode: optionalTrimmed(32),
  courseName: z.string().trim().min(1, { error: '请填写课程名称' }).max(80, { error: '课程名最多 80 字' }),
  teacherName: z.string().trim().min(1, { error: '请填写任课教师姓名' }).max(40, { error: '教师名最多 40 字' }),
  campusId: z.string().trim().min(1).max(20).optional().default('hemc'),
  category: z.enum(SHARED_COURSE_CATEGORIES).default('general_elective'),
  subCategory: optionalTrimmed(30),
  department: optionalTrimmed(50),
  credits: z.number().min(0.5).max(10).nullable().optional(),
});

export type CreateCourseAndReviewInput = z.infer<typeof createCourseAndReviewSchema>;

export const catalogImportItemSchema = z.object({
  courseCode: optionalTrimmed(32),
  courseName: z.string().trim().min(1).max(80),
  teacherName: z.string().trim().min(1).max(40),
  campusId: z.string().trim().min(1).max(20).optional().default('hemc'),
  category: z.enum(SHARED_COURSE_CATEGORIES),
  subCategory: optionalTrimmed(30),
  department: optionalTrimmed(50),
  credits: z.number().min(0.5).max(10).nullable().optional(),
});

export type CatalogImportItem = z.infer<typeof catalogImportItemSchema>;

export const catalogImportSchema = z.object({
  items: z.array(catalogImportItemSchema).min(1, { error: '请至少提供 1 门选修课' }).max(1500, { error: '单次最多导入 1500 门选修课' }),
});

export type CatalogImportRequest = z.infer<typeof catalogImportSchema>;

export const courseListQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  category: z.enum(SHARED_COURSE_CATEGORIES).optional(),
  subCategory: z.string().trim().max(30).optional(),
  campusId: z.string().trim().max(20).optional(),
  tag: z.string().trim().max(20).optional(),
  sort: z.enum(COURSE_SORT_OPTIONS).optional().default('bayes'),
  onlyReviewed: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .optional()
    .transform((v) => v === true || v === 'true' || v === '1'),
  page: z.coerce.number().int().min(1).max(200).optional().default(1),
  pageSize: z.coerce.number().int().min(10).max(60).optional().default(30),
});

export type CourseListQuery = z.infer<typeof courseListQuerySchema>;

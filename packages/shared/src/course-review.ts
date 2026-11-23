/**
 * 广东工业大学选课评价共享库模型与聚合算法。
 *
 * 严格聚焦广工最核心的两大选课场景：
 * - general_elective：公共选修课（通识选修课，涵盖人文社科 / 自然科学 / 美育艺术 / 创新创业 / 网络通选）
 * - pe：体育选课（大学城及各校区体育选项课）
 */
import { computeBayesScore, DEFAULT_GLOBAL_AVG } from './review.js';

export const SHARED_COURSE_CATEGORIES = ['general_elective', 'pe'] as const;

export type SharedCourseCategory = (typeof SHARED_COURSE_CATEGORIES)[number];

export const SHARED_COURSE_CATEGORY_LABELS: Record<SharedCourseCategory, string> = {
  general_elective: '公共选修课',
  pe: '体育选课',
};

export const PUBLIC_ELECTIVE_SUBCATEGORIES = [
  '人文社科',
  '自然科学',
  '美育艺术',
  '创新创业',
  '网络通选',
] as const;

export const PE_SUBCATEGORIES = ['球类项目', '操舞身心', '武术对抗', '游泳健身', '休闲专项'] as const;

export const COURSE_ATTENDANCE_LEVELS = ['none', 'occasional', 'strict'] as const;
export type CourseAttendanceLevel = (typeof COURSE_ATTENDANCE_LEVELS)[number];

export const COURSE_ATTENDANCE_LABELS: Record<CourseAttendanceLevel, string> = {
  none: '不点名',
  occasional: '偶尔抽点',
  strict: '经常/必点名',
};

export const COURSE_EXAM_FORMATS = ['open_book', 'closed_book', 'paper', 'project', 'mixed'] as const;
export type CourseExamFormat = (typeof COURSE_EXAM_FORMATS)[number];

export const COURSE_EXAM_FORMAT_LABELS: Record<CourseExamFormat, string> = {
  open_book: '开卷考试',
  closed_book: '闭卷考试',
  paper: '论文/报告',
  project: '大作业/展示',
  mixed: '综合考核',
};

export const COURSE_REVIEW_PRESET_TAGS = [
  '给分高',
  '捞人',
  '不点名',
  '讲课有趣',
  '作业少',
  '水课推荐',
  '干货满满',
  '期末友好',
  '平时分高',
  '点名严',
  '给分偏严',
  '任务偏多',
] as const;

export const COURSE_SORT_OPTIONS = ['bayes', 'grading', 'workload', 'reviews', 'latest'] as const;
export type CourseSortOption = (typeof COURSE_SORT_OPTIONS)[number];

export interface SharedCourse {
  id: string;
  courseCode: string | null;
  courseName: string;
  teacherName: string;
  campusId: string;
  category: SharedCourseCategory;
  subCategory: string | null;
  department: string | null;
  credits: number | null;
  ratingOverall: number;
  ratingGrading: number;
  ratingWorkload: number;
  ratingQuality: number;
  reviewCount: number;
  bayesScore: number;
  topTags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CourseReviewItem {
  id: string;
  courseId: string;
  userId: string;
  authorNickname: string;
  anonymous: boolean;
  scoreOverall: number;
  scoreGrading: number;
  scoreWorkload: number;
  scoreQuality: number;
  attendance: CourseAttendanceLevel;
  examFormat: CourseExamFormat;
  semesterTaken: string | null;
  tags: string[];
  content: string;
  likeCount: number;
  likedByMe: boolean;
  isMine: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CourseReviewListResponse {
  items: SharedCourse[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface CourseReviewDetailResponse {
  course: SharedCourse;
  reviews: CourseReviewItem[];
  myReview: CourseReviewItem | null;
  attendanceStats: Record<CourseAttendanceLevel, number>;
  examFormatStats: Record<CourseExamFormat, number>;
}

export interface CatalogImportResult {
  added: number;
  updated: number;
  skipped: number;
  total: number;
}

export interface AggregatableCourseReview {
  scoreOverall: number;
  scoreGrading: number;
  scoreWorkload: number;
  scoreQuality: number;
  tags: string[];
}

export interface CourseReviewAggregation {
  ratingOverall: number;
  ratingGrading: number;
  ratingWorkload: number;
  ratingQuality: number;
  reviewCount: number;
  bayesScore: number;
  topTags: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** 规范化课程/教师名用于去重比对（去首尾与多余空格） */
export function normalizeCourseIdentity(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

/** 根据一门课的全部可见评价重算多维均分、贝叶斯口碑分与高频标签 */
export function computeCourseReviewAggregation(
  reviews: AggregatableCourseReview[],
  globalAvg: number = DEFAULT_GLOBAL_AVG,
): CourseReviewAggregation {
  const count = reviews.length;
  if (count === 0) {
    return {
      ratingOverall: 0,
      ratingGrading: 0,
      ratingWorkload: 0,
      ratingQuality: 0,
      reviewCount: 0,
      bayesScore: 0,
      topTags: [],
    };
  }

  let sumOverall = 0;
  let sumGrading = 0;
  let sumWorkload = 0;
  let sumQuality = 0;
  const tagCounts = new Map<string, number>();

  for (const r of reviews) {
    sumOverall += r.scoreOverall;
    sumGrading += r.scoreGrading;
    sumWorkload += r.scoreWorkload;
    sumQuality += r.scoreQuality;
    for (const rawTag of r.tags) {
      const t = rawTag.trim();
      if (t) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  }

  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .slice(0, 4)
    .map(([tag]) => tag);

  return {
    ratingOverall: round2(sumOverall / count),
    ratingGrading: round1(sumGrading / count),
    ratingWorkload: round1(sumWorkload / count),
    ratingQuality: round1(sumQuality / count),
    reviewCount: count,
    bayesScore: computeBayesScore(sumOverall, count, globalAvg, 3),
    topTags,
  };
}

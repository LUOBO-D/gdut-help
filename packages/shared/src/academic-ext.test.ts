import { describe, expect, it } from 'vitest';
import { computeCourseReviewAggregation, SHARED_COURSE_CATEGORIES } from './course-review.js';
import { classifyCourseCreditBucket, computeCreditProgress, DEFAULT_CREDIT_PLAN, parseCreditAudit } from './credit.js';
import { GDUT_PUBLIC_ELECTIVE_SEED, parseElectiveCatalog } from './gdut-elective-catalog.js';
import type { CourseGrade } from './grade.js';
import {
  academicYearOfSemester,
  inferSemesterCodeFromDate,
  parseSecondClassImport,
  summarizeSecondClass,
  type SecondClassRecord,
} from './second-class.js';

const mkGrade = (overrides: Partial<CourseGrade>): CourseGrade => ({
  id: 'g1',
  semesterCode: '202601',
  semesterName: '2026-2027 秋季',
  courseCode: null,
  courseName: '数据结构',
  credits: 3,
  scoreText: '88',
  scoreNum: 88,
  gradePoint: 3.8,
  courseType: '专业必修',
  examType: '正常考试',
  source: 'import',
  importKey: null,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  ...overrides,
});

describe('credit progress & audit parser', () => {
  it('classifies GDUT courses into the 5 graduation buckets and deduplicates retakes', () => {
    expect(classifyCourseCreditBucket('公共必修', '高等数学A(1)')).toBe('general_required');
    expect(classifyCourseCreditBucket('公共选修', '电影赏析')).toBe('general_elective');
    expect(classifyCourseCreditBucket('专业选修', '人工智能导论')).toBe('major_elective');
    expect(classifyCourseCreditBucket('必修', '数据结构课程设计')).toBe('practice');

    const summary = computeCreditProgress(
      [
        mkGrade({ id: '1', courseName: '高等数学A', credits: 5, courseType: '公共必修', scoreText: '52', scoreNum: 52, gradePoint: 0 }),
        mkGrade({ id: '2', courseName: '高等数学A', credits: 5, courseType: '公共必修', scoreText: '75', scoreNum: 75, gradePoint: 2.5 }),
        mkGrade({ id: '3', courseName: '数据结构', credits: 4, courseType: '专业必修' }),
        mkGrade({ id: '4', courseName: '电影赏析', credits: 2, courseType: '通识选修' }),
        mkGrade({ id: '5', courseName: '大学物理实验', credits: 1.5, courseType: '实践环节', scoreText: '50', scoreNum: 50, gradePoint: 0 }),
      ],
      DEFAULT_CREDIT_PLAN,
    );

    expect(summary.earnedTotal).toBe(11);
    expect(summary.passedCourseCount).toBe(3);
    expect(summary.failedCredits).toBe(1.5);
    expect(summary.failedCourses).toHaveLength(1);
    expect(summary.buckets.find((b) => b.key === 'general_required')?.earned).toBe(5);
    expect(summary.buckets.find((b) => b.key === 'major_required')?.earned).toBe(4);
    expect(summary.buckets.find((b) => b.key === 'general_elective')?.earned).toBe(2);
  });

  it('parses GDUT jxfw credit audit JSON payload', () => {
    const raw = JSON.stringify({
      rows: [
        { kcxzmc: '通识教育必修课', yqxf: '42', yxxf: '38.5', qxxf: '3.5' },
        { kcxzmc: '通识选修课', yqxf: '10', yxxf: '6', qxxf: '4' },
      ],
    });
    const modules = parseCreditAudit(raw);
    expect(modules).toHaveLength(2);
    expect(modules[0]).toEqual({ name: '通识教育必修课', required: 42, earned: 38.5, missing: 3.5 });
  });
});

describe('second-class hours summary & import parser', () => {
  it('separates current semester and current academic year hours accurately', () => {
    expect(inferSemesterCodeFromDate('2026-10-15')).toBe('202601');
    expect(inferSemesterCodeFromDate('2027-04-10')).toBe('202602');
    expect(academicYearOfSemester('202602')).toBe('2026-2027');

    const mkSc = (over: Partial<SecondClassRecord>): SecondClassRecord => ({
      id: 'sc1',
      academicYear: '2026-2027',
      semesterCode: '202601',
      semesterName: '2026-2027 秋季',
      title: '人工智能前沿讲座',
      category: 'innovation',
      hours: 2,
      credits: 0.2,
      activityDate: '2026-10-12',
      organizer: '计算机学院',
      status: 'approved',
      source: 'manual',
      importKey: null,
      note: null,
      createdAt: '2026-10-12T00:00:00Z',
      updatedAt: '2026-10-12T00:00:00Z',
      ...over,
    });

    const summary = summarizeSecondClass(
      [
        mkSc({ id: 'a', semesterCode: '202601', hours: 4, category: 'volunteer' }),
        mkSc({ id: 'b', semesterCode: '202601', hours: 2, category: 'innovation', status: 'pending' }),
        mkSc({ id: 'c', semesterCode: '202602', hours: 6, category: 'practice', activityDate: '2027-03-20' }),
        mkSc({ id: 'd', academicYear: '2025-2026', semesterCode: '202501', hours: 10 }),
      ],
      { academicYear: '2026-2027', semesterCode: '202601', semesterTargetHours: 12, yearTargetHours: 24 },
    );

    expect(summary.currentSemester.totalHours).toBe(6);
    expect(summary.currentSemester.approvedHours).toBe(4);
    expect(summary.currentSemester.pendingHours).toBe(2);
    expect(summary.currentAcademicYear.totalHours).toBe(12);
    expect(summary.currentAcademicYear.percent).toBe(50);
  });

  it('parses pasted Better Me / volunteer TSV text', () => {
    const pasted = [
      '活动名称\t所属模块\t日期\t学时',
      '广工大学城图书馆志愿整理\t公益志愿\t2026-10-20\t3.5',
      '挑战杯校赛宣讲会\t创新创业\t2026-11-05\t2',
    ].join('\n');
    const items = parseSecondClassImport(pasted);
    expect(items).toHaveLength(2);
    expect(items[0]?.category).toBe('volunteer');
    expect(items[0]?.hours).toBe(3.5);
    expect(items[0]?.semesterCode).toBe('202601');
  });
});

describe('shared course review aggregation & elective catalog parser', () => {
  it('restricts shared course categories strictly to public elective and PE', () => {
    expect(SHARED_COURSE_CATEGORIES).toEqual(['general_elective', 'pe']);
    expect(GDUT_PUBLIC_ELECTIVE_SEED.length).toBeGreaterThanOrEqual(30);
  });

  it('computes multi-dimensional ratings, bayes score, and top tags', () => {
    const agg = computeCourseReviewAggregation([
      { scoreOverall: 5, scoreGrading: 5, scoreWorkload: 5, scoreQuality: 4, tags: ['给分高', '不点名'] },
      { scoreOverall: 4, scoreGrading: 5, scoreWorkload: 4, scoreQuality: 5, tags: ['给分高', '讲课有趣'] },
    ]);
    expect(agg.reviewCount).toBe(2);
    expect(agg.ratingOverall).toBe(4.5);
    expect(agg.ratingGrading).toBe(5);
    expect(agg.topTags[0]).toBe('给分高');
    expect(agg.bayesScore).toBeGreaterThan(4);
  });

  it('parses GDUT jxfw JSON and pasted TSV elective tables into general_elective and pe', () => {
    const json = JSON.stringify({
      rows: [
        { kcdm: 'GG001', kcmc: '岭南衣裳', teaxms: '李教授', xf: '2', kcxzmc: '公共选修课', xqmc: '大学城校区' },
        { kcdm: 'TY002', kcmc: '体育（羽毛球）', teaxms: '王教练', xf: '1', kcxzmc: '体育选项课', xqmc: '大学城校区' },
        { kcdm: 'CS101', kcmc: '操作系统', teaxms: '赵教授', xf: '4', kcxzmc: '专业必修课', xqmc: '大学城校区' },
      ],
    });
    const items = parseElectiveCatalog(json);
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.courseName === '岭南衣裳')?.category).toBe('general_elective');
    expect(items.find((i) => i.courseName === '岭南衣裳')?.subCategory).toBe('美育艺术');
    expect(items.find((i) => i.courseName === '体育（羽毛球）')?.category).toBe('pe');
    expect(items.find((i) => i.courseName === '体育（羽毛球）')?.subCategory).toBe('球类项目');
  });
});

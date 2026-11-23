import { describe, expect, it } from 'vitest';
import {
  computeGpaSummary,
  convertGdutScore,
  formatSemesterName,
  normalizeSemesterCode,
  simulateGpaWithCourse,
  type CourseGrade,
} from './grade.js';
import { diffGradeSync, parseGradeImport } from './grade-import.js';

function makeGrade(overrides: Partial<CourseGrade> = {}): CourseGrade {
  return {
    id: 'g1',
    semesterCode: '202501',
    semesterName: '2025-2026 秋季',
    courseCode: 'CS101',
    courseName: '高等数学A(1)',
    credits: 5,
    scoreText: '88',
    scoreNum: 88,
    gradePoint: 3.8,
    courseType: '必修',
    examType: '正常考试',
    source: 'import',
    importKey: '202501|code:cs101',
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('广工 5.0 制绩点计算引擎', () => {
  it('按广工标准准确转换百分制与五级制成绩为绩点', () => {
    expect(convertGdutScore('95')).toEqual({ scoreNum: 95, gradePoint: 4.5, passed: true });
    expect(convertGdutScore('86')).toEqual({ scoreNum: 86, gradePoint: 3.6, passed: true });
    expect(convertGdutScore('60')).toEqual({ scoreNum: 60, gradePoint: 1.0, passed: true });
    expect(convertGdutScore('58')).toEqual({ scoreNum: 58, gradePoint: 0, passed: false });
    expect(convertGdutScore('优秀')).toEqual({ scoreNum: 95, gradePoint: 4.5, passed: true });
    expect(convertGdutScore('良好')).toEqual({ scoreNum: 85, gradePoint: 3.5, passed: true });
    expect(convertGdutScore('中等')).toEqual({ scoreNum: 75, gradePoint: 2.5, passed: true });
    expect(convertGdutScore('及格')).toEqual({ scoreNum: 65, gradePoint: 1.5, passed: true });
    expect(convertGdutScore('不及格')).toEqual({ scoreNum: 0, gradePoint: 0, passed: false });
  });

  it('能规范化并格式化广工教务学期代码', () => {
    expect(normalizeSemesterCode('202501')).toBe('202501');
    expect(normalizeSemesterCode('2025-2026-2')).toBe('202502');
    expect(formatSemesterName('202501')).toBe('2025-2026 秋季');
    expect(formatSemesterName('202502')).toBe('2025-2026 春季');
  });

  it('按学分加权正确计算总绩点、必修绩点、挂科影响与学位线判断', () => {
    const grades: CourseGrade[] = [
      makeGrade({ id: '1', credits: 5, scoreText: '90', scoreNum: 90, gradePoint: 4.0, courseType: '必修' }),
      makeGrade({ id: '2', credits: 3, scoreText: '80', scoreNum: 80, gradePoint: 3.0, courseType: '必修' }),
      makeGrade({ id: '3', credits: 2, scoreText: '55', scoreNum: 55, gradePoint: 0, courseType: '公共选修' }),
    ];

    const all = computeGpaSummary(grades);
    // (5*4.0 + 3*3.0 + 2*0) / 10 = 2.90
    expect(all.gpa).toBe(2.9);
    expect(all.totalCredits).toBe(10);
    expect(all.earnedCredits).toBe(8);
    expect(all.failedCount).toBe(1);
    expect(all.meetsDegreeLine).toBe(true);

    const reqOnly = computeGpaSummary(grades, { requiredOnly: true });
    // (5*4.0 + 3*3.0) / 8 = 3.625 -> 3.63
    expect(reqOnly.gpa).toBe(3.63);
    expect(reqOnly.courseCount).toBe(2);
    expect(reqOnly.failedCount).toBe(0);
  });

  it('绩点试算能准确预估新增课程带来的绩点变化', () => {
    const sim = simulateGpaWithCourse({ gpa: 3.5, totalCredits: 20 }, 4, '95');
    // (3.5*20 + 4.5*4) / 24 = 88 / 24 = 3.67
    expect(sim.courseGp).toBe(4.5);
    expect(sim.newGpa).toBe(3.67);
    expect(sim.delta).toBe(0.17);
  });
});

describe('广工教务成绩解析与增量同步比对', () => {
  it('能解析乘方教务 xskccjxx!getDataList.action 返回的 JSON', () => {
    const payload = JSON.stringify({
      total: 2,
      rows: [
        {
          xnxqdm: '202501',
          kcdm: '080101',
          kcmc: '数据结构',
          xf: '4.0',
          zcj: '92',
          cjjd: '4.2',
          kcdlmc: '专业必修',
          ksxzmc: '正常考试',
        },
        {
          xnxqdm: '202501',
          kcdm: '100201',
          kcmc: '大学体育(3)',
          xf: '1.0',
          zcj: '良好',
          kcdlmc: '公共必修',
        },
      ],
    });

    const parsed = parseGradeImport(payload);
    expect(parsed.grades).toHaveLength(2);
    expect(parsed.grades[0]!.courseName).toBe('数据结构');
    expect(parsed.grades[0]!.gradePoint).toBe(4.2);
    expect(parsed.grades[1]!.courseName).toBe('大学体育(3)');
    expect(parsed.grades[1]!.gradePoint).toBe(3.5);
  });

  it('能解析从网页复制的 TSV 成绩表并准确计算增量 diff', () => {
    const tsv = [
      '学年学期\t课程编号\t课程名称\t学分\t总成绩\t成绩绩点\t课程性质',
      '202501\tCS101\t高等数学A(1)\t5\t91\t4.1\t必修',
      '202502\tCS102\t离散数学\t3\t85\t3.5\t必修',
    ].join('\n');

    const parsed = parseGradeImport(tsv);
    expect(parsed.grades).toHaveLength(2);

    const existing = [
      makeGrade({ id: 'old-1', scoreText: '88', scoreNum: 88, gradePoint: 3.8 }),
      makeGrade({ id: 'manual-1', source: 'manual', importKey: null, courseName: '手动试算课' }),
    ];
    const diff = diffGradeSync(existing, parsed.grades);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]!.courseName).toBe('离散数学');
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0]!.after.gradePoint).toBe(4.1);
    // 手动课程不受教务同步删除影响
    expect(diff.removed).toHaveLength(0);
  });
});

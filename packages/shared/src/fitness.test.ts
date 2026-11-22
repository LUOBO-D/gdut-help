import { describe, expect, it } from 'vitest';
import {
  defaultAcademicYear,
  estimateGraduationFitness,
  evaluateBmi,
  evaluateFitnessRecord,
  formatRunTime,
  parseRunTime,
  type FitnessRecord,
} from './fitness.js';
import { diffFitnessImport, parseFitnessImport } from './fitness-import.js';

function makeRecord(overrides: Partial<FitnessRecord> = {}): FitnessRecord {
  return {
    id: 'f1',
    academicYear: '2025-2026',
    gradeYear: 2,
    gender: 'male',
    heightCm: 175,
    weightKg: 65,
    lungCapacityMl: 4300, // 80
    sprint50mSec: 7.1, // 80
    sitAndReachCm: 17.7, // 80
    standingLongJumpCm: 248, // 80
    strengthCount: 15, // 80
    enduranceSec: 222, // 3'42" -> 80
    exempt: false,
    officialTotal: null,
    testedAt: '2025-11-08',
    note: null,
    source: 'manual',
    createdAt: '2025-11-08T00:00:00.000Z',
    updatedAt: '2025-11-08T00:00:00.000Z',
    ...overrides,
  };
}

describe('国家学生体质健康标准（2014）自动评分引擎', () => {
  it('能正确格式化和解析多种长跑成绩写法', () => {
    expect(formatRunTime(225)).toBe("3'45\"");
    expect(parseRunTime("3'45\"")).toBe(225);
    expect(parseRunTime('3:45')).toBe(225);
    expect(parseRunTime('3分45秒')).toBe(225);
    expect(parseRunTime('3.45')).toBe(225);
    expect(parseRunTime('225秒')).toBe(225);
    expect(parseRunTime('4分')).toBe(240);
    expect(parseRunTime('invalid')).toBeNull();
  });

  it('按男女标准精确计算 BMI 分数与体型分类', () => {
    expect(evaluateBmi(175, 65, 'male')).toEqual({ bmi: 21.2, category: 'normal', score: 100 });
    expect(evaluateBmi(175, 52, 'male')).toEqual({ bmi: 17.0, category: 'underweight', score: 80 });
    expect(evaluateBmi(175, 78, 'male')).toEqual({ bmi: 25.5, category: 'overweight', score: 80 });
    expect(evaluateBmi(175, 90, 'male')).toEqual({ bmi: 29.4, category: 'obese', score: 60 });
    expect(evaluateBmi(165, 47, 'female')).toEqual({ bmi: 17.3, category: 'normal', score: 100 });
    expect(evaluateBmi(165, 46, 'female')).toEqual({ bmi: 16.9, category: 'underweight', score: 80 });
  });

  it('大学男生大二各项 80 分 + 正常 BMI 100 分，总分应为 83.0（良好）', () => {
    const ev = evaluateFitnessRecord(makeRecord());
    expect(ev.completedCount).toBe(7);
    expect(ev.standardScore).toBe(83);
    expect(ev.bonusScore).toBe(0);
    expect(ev.totalScore).toBe(83);
    expect(ev.level).toBe('good');
  });

  it('男生引体向上与 1000 米跑超 100 分标准时正确叠加附加分（满分 120）', () => {
    const ev = evaluateFitnessRecord(
      makeRecord({
        gradeYear: 3, // 大三组：100分线为肺活量5140/50m6.6/体前屈25.1/跳远275/引体20/1000m 3'15"(195s)
        lungCapacityMl: 5200,
        sprint50mSec: 6.6,
        sitAndReachCm: 25.5,
        standingLongJumpCm: 276,
        strengthCount: 25, // 超20个5次 -> +5
        enduranceSec: 175, // 2'55"，比 3'15"(195s) 快 20s -> +5
      }),
    );
    expect(ev.standardScore).toBe(100);
    expect(ev.bonusScore).toBe(10);
    expect(ev.totalScore).toBe(110);
    expect(ev.level).toBe('excellent');
  });

  it('大学女生大一大二全项及格线与附加分计算准确', () => {
    const passEv = evaluateFitnessRecord(
      makeRecord({
        gender: 'female',
        gradeYear: 1,
        heightCm: 162,
        weightKg: 52, // BMI 19.8 -> 100
        lungCapacityMl: 2000, // 60
        sprint50mSec: 10.3, // 60
        sitAndReachCm: 6.0, // 60
        standingLongJumpCm: 151, // 60
        strengthCount: 26, // 60
        enduranceSec: 274, // 4'34" -> 60
      }),
    );
    expect(passEv.standardScore).toBe(66); // 100*0.15 + 60*0.85 = 66
    expect(passEv.level).toBe('pass');

    const bonusEv = evaluateFitnessRecord(
      makeRecord({
        gender: 'female',
        gradeYear: 4, // 大四：仰卧57满分，800米 3'16"(196s)满分
        strengthCount: 63, // 超57个6次 -> +3分
        enduranceSec: 176, // 快20秒 -> +4分
      }),
    );
    expect(bonusEv.bonusScore).toBe(7);
  });

  it('免测学年按 60 分计入且状态为免测', () => {
    const ev = evaluateFitnessRecord(makeRecord({ exempt: true, enduranceSec: null, sprint50mSec: null }));
    expect(ev.totalScore).toBe(60);
    expect(ev.level).toBe('exempt');
  });

  it('按国家公式估算毕业体测总评（大四×50% + 其他均分×50%），并反推大四目标分', () => {
    const y1 = makeRecord({ id: '1', academicYear: '2023-2024', gradeYear: 1 }); // 83.0
    const y2 = makeRecord({
      id: '2',
      academicYear: '2024-2025',
      gradeYear: 2,
      lungCapacityMl: 5040, // +20*0.15 = +3
      sprint50mSec: 6.7, // +20*0.20 = +4 -> 90.0
    });
    const beforeSenior = estimateGraduationFitness([y1, y2]);
    expect(beforeSenior.hasSenior).toBe(false);
    expect(beforeSenior.score).toBe(86.5);
    expect(beforeSenior.latestDelta).toBe(7);
    expect(beforeSenior.neededSeniorFor50).toBe(13.5);
    expect(beforeSenior.neededSeniorFor60).toBe(33.5);
    expect(beforeSenior.neededSeniorFor80).toBe(73.5);

    const y4 = makeRecord({ id: '4', academicYear: '2026-2027', gradeYear: 4, exempt: true }); // 60.0
    const withSenior = estimateGraduationFitness([y1, y2, y4]);
    expect(withSenior.hasSenior).toBe(true);
    expect(withSenior.score).toBe(73.3); // (60*0.5 + 86.5*0.5) = 73.25 -> 73.3
    expect(withSenior.meetsGraduation).toBe(true);
  });

  it('能按 9 月新学年规则推算默认学年', () => {
    expect(defaultAcademicYear(new Date('2026-11-22T04:00:00.000Z'))).toBe('2026-2027');
    expect(defaultAcademicYear(new Date('2026-04-15T04:00:00.000Z'))).toBe('2025-2026');
  });
});

describe('体测成绩多格式导入解析与差异比对', () => {
  it('能解析体测网页复制的多学年 TSV 表格（兼容米制身高/跳远和分秒长跑）', () => {
    const tsv = [
      '学年\t年级\t性别\t身高(cm)\t体重(kg)\t肺活量\t50米跑\t坐位体前屈\t立定跳远\t引体向上\t1000米跑\t总分',
      "2024-2025\t大一\t男\t1.76\t66.0\t4500\t7.2\t15.5\t2.40\t13\t3'50\"\t81.5",
      '2025-2026\t大二\t男\t176.2\t65.4\t4700\t7.0\t17.8\t248\t15\t3:40\t85.2',
    ].join('\n');

    const res = parseFitnessImport(tsv);
    expect(res.warnings).toHaveLength(0);
    expect(res.records).toHaveLength(2);
    expect(res.records[0]!.academicYear).toBe('2025-2026');
    expect(res.records[0]!.enduranceSec).toBe(220);
    expect(res.records[1]!.heightCm).toBe(176);
    expect(res.records[1]!.standingLongJumpCm).toBe(240);
    expect(res.records[1]!.enduranceSec).toBe(230);
  });

  it('能解析微信公众号成绩页复制的纯文本并自动识别女生项目', () => {
    const wechatText = `
      2025-2026学年 大二
      身高：163.5cm
      体重：51.2kg
      肺活量：3120ml
      50米跑：8.2秒
      坐位体前屈：19.5cm
      立定跳远：182cm
      1分钟仰卧起坐：47次
      800米跑：3分42秒
    `;
    const res = parseFitnessImport(wechatText);
    expect(res.records).toHaveLength(1);
    const r = res.records[0]!;
    expect(r.gender).toBe('female');
    expect(r.gradeYear).toBe(2);
    expect(r.strengthCount).toBe(47);
    expect(r.enduranceSec).toBe(222);
  });

  it('按学年准确计算增量导入差异（新增 / 变更 / 无变化）', () => {
    const existing = [makeRecord({ academicYear: '2024-2025', gradeYear: 1, lungCapacityMl: 4200 })];
    const parsed = parseFitnessImport(
      JSON.stringify([
        {
          academicYear: '2024-2025',
          gradeYear: 1,
          gender: 'male',
          heightCm: 175,
          weightKg: 65,
          lungCapacityMl: 4500,
          sprint50mSec: 7.1,
          sitAndReachCm: 17.7,
          standingLongJumpCm: 248,
          strengthCount: 15,
          enduranceSec: 222,
          testedAt: '2025-11-08',
        },
        {
          academicYear: '2025-2026',
          gradeYear: 2,
          gender: 'male',
          heightCm: 176,
          weightKg: 66,
          lungCapacityMl: 4700,
        },
      ]),
    );

    const diff = diffFitnessImport(existing, parsed.records);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]!.academicYear).toBe('2025-2026');
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0]!.after.lungCapacityMl).toBe(4500);
    expect(diff.unchanged).toBe(0);
  });
});

/**
 * 广东工业大学公共选修课与体育选课目录解析器 + 官方公开基础目录。
 *
 * - 支持解析广工乘方教务系统（全校开课查询 / 公选课选课列表）返回的 JSON、HTML 表格，
 *   以及从教务处选课通知 Excel/网页复制粘贴的表格文本；
 * - 严格筛选并归类为「公共选修课 (general_elective)」与「体育选课 (pe)」两大类；
 * - 内置广工公开的大学城全套 21 项体育选课与通识教育中心经典公选课基础目录（零冷启动）。
 */
import { normalizeCourseIdentity, type SharedCourseCategory } from './course-review.js';
import { DEFAULT_CAMPUS_ID } from './gdut.js';

export interface ParsedElectiveCatalogItem {
  courseCode: string | null;
  courseName: string;
  teacherName: string;
  campusId: string;
  category: SharedCourseCategory;
  subCategory: string | null;
  department: string | null;
  credits: number | null;
}

const clean = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  return s && s !== 'null' && s !== 'undefined' && s !== '-' && s !== '--' ? s : null;
};

/** 将校区文本映射到广工校区 ID */
export function resolveCampusId(raw: string | null | undefined, fallback = DEFAULT_CAMPUS_ID): string {
  const s = (raw ?? '').trim();
  if (!s) return fallback;
  if (/东风路/.test(s)) return 'dongfeng';
  if (/龙洞/.test(s)) return 'longdong';
  if (/番禺/.test(s)) return 'panyu';
  if (/揭阳/.test(s)) return 'jieyang';
  if (/沙河/.test(s)) return 'shahe';
  if (/大学城/.test(s)) return 'hemc';
  return fallback;
}

/** 识别某门课程是否属于「体育选课」或「公共选修课」；非此两类返回 null */
export function detectElectiveCategory(opts: {
  courseName: string;
  courseType?: string | null;
  department?: string | null;
  assumeElective?: boolean;
}): { category: SharedCourseCategory; subCategory: string | null } | null {
  const name = opts.courseName.trim();
  const type = (opts.courseType ?? '').trim();
  const dept = (opts.department ?? '').trim();

  // 1. 体育选课判定
  const isPe =
    /^体育|体育[（(]|体育选项|体育保健|大学体育/.test(name) ||
    /体育学院|体育部|体育教学/.test(dept) ||
    /体育课|体育选项/.test(type);
  if (isPe) {
    let sub: string = '休闲专项';
    if (/篮球|足球|排球|羽毛球|网球|乒乓球|高尔夫|台球/.test(name)) sub = '球类项目';
    else if (/瑜伽|普拉提|健美操|形体|太极|保健|健美/.test(name)) sub = '操舞身心';
    else if (/跆拳道|散打|武术|击剑|拳击/.test(name)) sub = '武术对抗';
    else if (/游泳|健身|田径|定向/.test(name)) sub = '游泳健身';
    return { category: 'pe', subCategory: sub };
  }

  // 2. 公共选修课（通识选修课）判定
  const isPublicElective =
    /公共选修|通识选修|公选|通选|任选|网络通选|尔雅|智慧树|超星|通识教育选修|美育|素质拓展/.test(`${type} ${name} ${dept}`) ||
    /通识教育中心/.test(dept) ||
    Boolean(opts.assumeElective);

  // 排除明确标为「专业必修 / 学科基础 / 专业选修 / 集中实践」的非公选课程
  if (
    !opts.assumeElective &&
    /专业必修|学科基础|公共必修|通识必修|专业选修|集中实践|课程设计|毕业设计/.test(type)
  ) {
    return null;
  }

  if (!isPublicElective) return null;

  let sub: string = '人文社科';
  const combo = `${type} ${name}`;
  if (/尔雅|智慧树|超星|慕课|MOOC|网络|线上/.test(combo)) sub = '网络通选';
  else if (/美育|音乐|电影|影视|艺术|绘画|书法|戏剧|舞蹈|美学|赏析|衣裳|灰塑|建筑美/.test(combo)) sub = '美育艺术';
  else if (/创新|创业|专利|知识产权|商业|管理|创业基础|领导力/.test(combo)) sub = '创新创业';
  else if (/自然|物理|化学|生物|天文|地理|科技|工程|数学|人工智能|大数据|量子|环境|医学|生命/.test(combo)) sub = '自然科学';
  return { category: 'general_elective', subCategory: sub };
}

type RawRec = Record<string, unknown>;

const CATALOG_ALIASES = {
  code: ['kcdm', 'kcbh', 'courseCode', 'code', '课程代码', '课程编号', '课号'],
  name: ['kcmc', 'kcm', 'courseName', 'name', '课程名称', '课程名', '课程'],
  teacher: ['teaxms', 'jsxm', 'rkjs', 'teacherName', 'teacher', '任课教师', '教师姓名', '教师', '老师', '主讲教师'],
  credits: ['xf', 'kcxf', 'credits', '学分'],
  campus: ['xqmc', 'kkxq', 'campus', '校区', '开课校区'],
  department: ['kkbmmc', 'kkxy', 'xymc', 'department', '开课学院', '开课单位', '承担单位', '学院'],
  courseType: ['kcxzmc', 'kclbmc', 'kcflmc', 'kcxz', 'courseType', 'category', '课程性质', '课程类别', '类别', '公选类别', '模块'],
} as const;

function pickCat(rec: RawRec, field: keyof typeof CATALOG_ALIASES): string | null {
  const keys = Object.keys(rec);
  for (const alias of CATALOG_ALIASES[field]) {
    const hit = keys.find((k) => k.toLowerCase() === alias.toLowerCase());
    if (hit !== undefined) {
      const val = clean(rec[hit]);
      if (val !== null) return val;
    }
  }
  return null;
}

function collectCatalogJson(node: unknown, out: RawRec[], depth = 0) {
  if (depth > 6 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectCatalogJson(item, out, depth + 1);
    return;
  }
  const rec = node as RawRec;
  if (pickCat(rec, 'name')) {
    out.push(rec);
    return;
  }
  for (const v of Object.values(rec)) collectCatalogJson(v, out, depth + 1);
}

function parseCatalogHtml(html: string): RawRec[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rows.length < 2) return [];
  const cellsOf = (r: string) => [...r.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => clean(m[1]) ?? '');
  const headerIdx = rows.findIndex((r) => cellsOf(r[1]!).some((c) => /课程名|课程名称/.test(c)));
  if (headerIdx < 0) return [];
  const headers = cellsOf(rows[headerIdx]![1]!);
  const out: RawRec[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cells = cellsOf(rows[i]![1]!);
    if (cells.length < 2) continue;
    const rec: RawRec = {};
    headers.forEach((h, idx) => {
      if (h && cells[idx] !== undefined) rec[h] = cells[idx];
    });
    if (pickCat(rec, 'name')) out.push(rec);
  }
  return out;
}

function parseCatalogText(text: string): RawRec[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const splitLine = (line: string) =>
    line.includes('\t') ? line.split('\t').map((c) => c.trim()) : line.split(/\s{2,}|[,，|]/).map((c) => c.trim());

  const firstCols = splitLine(lines[0]!);
  const hasHeader = firstCols.some((c) => /课程名|课程名称|任课教师|教师|学分/.test(c));
  const out: RawRec[] = [];

  if (hasHeader && lines.length >= 2) {
    for (let i = 1; i < lines.length; i++) {
      const cols = splitLine(lines[i]!);
      if (cols.length < 2) continue;
      const rec: RawRec = {};
      firstCols.forEach((h, idx) => {
        if (h && cols[idx] !== undefined) rec[h] = cols[idx];
      });
      if (pickCat(rec, 'name')) out.push(rec);
    }
    return out;
  }

  // 无表头智能按列推断：课程名 | 老师 | (可选学分/分类/校区)
  for (const line of lines) {
    const cols = splitLine(line);
    if (cols.length < 2) continue;
    const creditCol = cols.find((c) => /^\d(?:\.\d)?$/.test(c)) ?? null;
    const campusCol = cols.find((c) => /大学城|东风路|龙洞|番禺|揭阳|沙河/.test(c)) ?? null;
    const typeCol = cols.find((c) => /公选|通选|人文|自然|美育|创新|网络|体育/.test(c) && c !== cols[0]) ?? null;
    const nonMeta = cols.filter((c) => c && c !== creditCol && c !== campusCol && c !== typeCol && !/^\d{5,}$/.test(c));
    if (nonMeta.length < 1) continue;
    out.push({
      name: nonMeta[0],
      teacher: nonMeta[1] ?? '待补充教师',
      credits: creditCol,
      campus: campusCol,
      courseType: typeCol,
    });
  }
  return out;
}

/**
 * 解析广工公选课/体育选课目录（支持教务 JSON、HTML 表格、Excel/文本粘贴）。
 * @param assumeElective 当来源本身就是公选课/选课页面时传 true，避免教务省略课程性质列导致漏识别。
 */
export function parseElectiveCatalog(
  raw: string,
  opts?: { defaultCampusId?: string; assumeElective?: boolean },
): ParsedElectiveCatalogItem[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let records: RawRec[] = [];
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      collectCatalogJson(JSON.parse(trimmed) as unknown, records);
    } catch {
      return [];
    }
  } else if (/<tr\b/i.test(trimmed)) {
    records = parseCatalogHtml(trimmed);
  } else {
    records = parseCatalogText(trimmed);
  }

  const defaultCampus = opts?.defaultCampusId || DEFAULT_CAMPUS_ID;
  const dedup = new Map<string, ParsedElectiveCatalogItem>();

  for (const rec of records) {
    const nameRaw = pickCat(rec, 'name');
    if (!nameRaw) continue;
    const courseName = normalizeCourseIdentity(nameRaw).slice(0, 80);
    const courseType = pickCat(rec, 'courseType');
    const department = pickCat(rec, 'department')?.slice(0, 50) ?? null;

    const detected = detectElectiveCategory({
      courseName,
      courseType,
      department,
      assumeElective: opts?.assumeElective,
    });
    if (!detected) continue;

    const teacherRaw = pickCat(rec, 'teacher');
    const teacherName = normalizeCourseIdentity(
      (teacherRaw ?? (detected.category === 'pe' ? '体育教学部' : '学校排课教师')).split(/[,，、;；]/)[0] ?? '待补充教师',
    ).slice(0, 40);

    const campusId = resolveCampusId(pickCat(rec, 'campus'), defaultCampus);
    const creditsRaw = pickCat(rec, 'credits');
    const creditsNum = creditsRaw ? Number(creditsRaw.replace(/[^\d.]/g, '')) : NaN;
    const credits = Number.isFinite(creditsNum) && creditsNum >= 0.5 && creditsNum <= 10 ? Math.round(creditsNum * 10) / 10 : null;
    const courseCode = pickCat(rec, 'code')?.slice(0, 32) ?? null;

    const key = `${courseName.toLowerCase()}|${teacherName.toLowerCase()}|${campusId}`;
    dedup.set(key, {
      courseCode,
      courseName,
      teacherName,
      campusId,
      category: detected.category,
      subCategory: detected.subCategory,
      department,
      credits,
    });
  }

  return [...dedup.values()];
}

/**
 * 广工已公开核实的选课评价共享库基础目录（零冷启动）：
 * 1. 大学城校区《体育课程选课指南》全部 21 项体育选课项目；
 * 2. 广工通识教育中心官网公开的经典与一流本科通识选修课程。
 * 完整按学期动态变化的全部老师名单，可通过「同步教务目录 / 粘贴选课表」与课表脱敏扩充持续补齐。
 */
export const GDUT_PUBLIC_ELECTIVE_SEED: readonly ParsedElectiveCatalogItem[] = [
  // —— 体育选课（大学城校区官方 21 项选项课）——
  { courseCode: null, courseName: '体育（篮球）', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '球类项目', department: '体育学院', credits: 1 },
  { courseCode: null, courseName: '体育（足球）', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '球类项目', department: '体育学院', credits: 1 },
  { courseCode: null, courseName: '体育（排球）', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '球类项目', department: '体育学院', credits: 1 },
  { courseCode: null, courseName: '体育（羽毛球）', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '球类项目', department: '体育学院', credits: 1 },
  { courseCode: null, courseName: '体育（网球）', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '球类项目', department: '体育学院', credits: 1 },
  { courseCode: null, courseName: '体育（乒乓球）', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '球类项目', department: '体育学院', credits: 1 },
  { courseCode: null, courseName: '体育（高尔夫）', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '球类项目', department: '体育学院', credits: 1 },
  { courseCode: null, courseName: '体育（台球）', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '球类项目', department: '体育学院', credits: 1 },
  { courseCode: null, courseName: '体育（游泳）', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '游泳健身', department: '体育学院', credits: 1 },
  { courseCode: null, courseName: '体育（健身与力量训练）', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '游泳健身', department: '体育学院', credits: 1 },
  { courseCode: null, courseName: '体育（定向运动）', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '游泳健身', department: '体育学院', credits: 1 },
  { courseCode: null, courseName: '体育（瑜伽）', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '操舞身心', department: '体育学院', credits: 1 },
  { courseCode: null, courseName: '体育（普拉提）', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '操舞身心', department: '体育学院', credits: 1 },
  { courseCode: null, courseName: '体育（健美操）', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '操舞身心', department: '体育学院', credits: 1 },
  { courseCode: null, courseName: '体育（形体）', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '操舞身心', department: '体育学院', credits: 1 },
  { courseCode: null, courseName: '体育（太极健身）', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '操舞身心', department: '体育学院', credits: 1 },
  { courseCode: null, courseName: '体育（跆拳道）', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '武术对抗', department: '体育学院', credits: 1 },
  { courseCode: null, courseName: '体育（散打）', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '武术对抗', department: '体育学院', credits: 1 },
  { courseCode: null, courseName: '体育（射箭）', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '休闲专项', department: '体育学院', credits: 1 },
  { courseCode: null, courseName: '体育（飞镖）', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '休闲专项', department: '体育学院', credits: 1 },
  { courseCode: null, courseName: '体育保健课', teacherName: '体育教学部（可按老师补充）', campusId: 'hemc', category: 'pe', subCategory: '操舞身心', department: '体育学院', credits: 1 },

  // —— 广工通识教育中心官网公开经典公共选修课 ——
  { courseCode: null, courseName: '岭南衣裳', teacherName: '通识教育中心（可按老师补充）', campusId: 'hemc', category: 'general_elective', subCategory: '美育艺术', department: '通识教育中心', credits: 2 },
  { courseCode: null, courseName: '音乐漫步', teacherName: '通识教育中心（可按老师补充）', campusId: 'hemc', category: 'general_elective', subCategory: '美育艺术', department: '通识教育中心', credits: 2 },
  { courseCode: null, courseName: '大学美育', teacherName: '通识教育中心（可按老师补充）', campusId: 'hemc', category: 'general_elective', subCategory: '美育艺术', department: '通识教育中心', credits: 2 },
  { courseCode: null, courseName: '岭南建筑灰塑技艺', teacherName: '通识教育中心（可按老师补充）', campusId: 'hemc', category: 'general_elective', subCategory: '美育艺术', department: '通识教育中心', credits: 2 },
  { courseCode: null, courseName: '影视剪辑艺术赏析', teacherName: '通识教育中心（可按老师补充）', campusId: 'hemc', category: 'general_elective', subCategory: '美育艺术', department: '通识教育中心', credits: 2 },
  { courseCode: null, courseName: '青春电影与青年文化', teacherName: '通识教育中心（可按老师补充）', campusId: 'hemc', category: 'general_elective', subCategory: '美育艺术', department: '通识教育中心', credits: 2 },
  { courseCode: null, courseName: '中国古代工程技术', teacherName: '通识教育中心（可按老师补充）', campusId: 'hemc', category: 'general_elective', subCategory: '自然科学', department: '通识教育中心', credits: 2 },
  { courseCode: null, courseName: '海外华侨华人', teacherName: '通识教育中心（可按老师补充）', campusId: 'hemc', category: 'general_elective', subCategory: '人文社科', department: '通识教育中心', credits: 2 },
  { courseCode: null, courseName: '现代传媒与批判性思维', teacherName: '通识教育中心（可按老师补充）', campusId: 'hemc', category: 'general_elective', subCategory: '人文社科', department: '通识教育中心', credits: 2 },
  { courseCode: null, courseName: '欧洲文明与世界遗产', teacherName: '通识教育中心（可按老师补充）', campusId: 'hemc', category: 'general_elective', subCategory: '人文社科', department: '通识教育中心', credits: 2 },
  { courseCode: null, courseName: '传统文化与文化传统', teacherName: '通识教育中心（可按老师补充）', campusId: 'hemc', category: 'general_elective', subCategory: '人文社科', department: '通识教育中心', credits: 2 },
  { courseCode: null, courseName: '大学生创新创业基础', teacherName: '创新创业学院（可按老师补充）', campusId: 'hemc', category: 'general_elective', subCategory: '创新创业', department: '创新创业学院', credits: 2 },
];

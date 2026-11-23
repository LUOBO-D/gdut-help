/**
 * 广东工业大学校园空教室解析、节次推算与实用百宝箱数据。
 *
 * 包含：
 * 1. 教务系统（乘方教务）空教室 JSON / HTML 解析器 + 教学楼归类；
 * 2. 当前节次块推算（用于空教室查询默认直达「当前空闲」）；
 * 3. 广工常驻自习空间、跨校区校车与地铁出行、正版软件与学术福利、校园电话黄页与报修入口。
 */
import { matchCampusBuilding } from './campus-map.js';
import { periodsFor } from './gdut.js';

export interface PeriodBlock {
  /** 传给教务空教室查询的节次编码，例如 '0102' */
  code: string;
  label: string;
  startPeriod: number;
  endPeriod: number;
  /** 起止时间文案，例如 '08:30–10:05' */
  timeRange: string;
}

export function periodBlocksFor(campusId?: string | null): PeriodBlock[] {
  const periods = periodsFor(campusId);
  const pairs: [number, number, string][] = [
    [1, 2, '0102'],
    [3, 4, '0304'],
    [5, 6, '0506'],
    [7, 8, '0708'],
    [9, 10, '0910'],
    [11, 12, '1112'],
  ];
  return pairs.map(([s, e, code]) => {
    const startP = periods[s - 1];
    const endP = periods[e - 1];
    return {
      code,
      label: `${s}-${e} 节`,
      startPeriod: s,
      endPeriod: e,
      timeRange: startP && endP ? `${startP.start}–${endP.end}` : '',
    };
  });
}

/** 推算给定北京时间此刻所处或即将开始的 2 节连堂块（默认用于空教室查询） */
export function currentPeriodBlock(now: Date = new Date(), campusId?: string | null): PeriodBlock {
  const bj = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const mins = bj.getUTCHours() * 60 + bj.getUTCMinutes();
  const blocks = periodBlocksFor(campusId);
  const periods = periodsFor(campusId);

  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number) as [number, number];
    return h * 60 + m;
  };

  for (const b of blocks) {
    const endP = periods[b.endPeriod - 1];
    if (endP && mins < toMin(endP.end)) {
      return b;
    }
  }
  return blocks[blocks.length - 1]!;
}

export interface EmptyClassroom {
  /** 教室全称，例如 '教3-305' */
  name: string;
  /** 所属教学楼分组，例如 '教3'、'大教室'、'工学一号馆' */
  building: string;
  /** 座位数（教务返回时提供） */
  seats: number | null;
  /** 场地类型（如多媒体教室、智慧教室） */
  roomType: string | null;
  /** 校区名 */
  campus: string | null;
  /** 关联的 3D 校园地图建筑 ID（支持一键去自习导航） */
  mapBuildingId: string | null;
}

export interface EmptyRoomsInferenceResponse {
  source: 'timetable';
  rooms: EmptyClassroom[];
  occupiedCount: number;
  totalKnownRooms: number;
}

const clean = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  return s && s !== 'null' && s !== 'undefined' && s !== '-' && s !== '--' ? s : null;
};

export function inferBuildingGroup(roomName: string, rawBuilding: string | null = null): string {
  if (rawBuilding) return rawBuilding;
  const mTeach = /(教[1-6一二三四五六])/.exec(roomName);
  if (mTeach) return mTeach[1]!;
  if (/大教室/.test(roomName)) return '大教室';
  const mGong = /(工学[一二三四1-4]号?馆)/.exec(roomName);
  if (mGong) return mGong[1]!;
  const mLab = /(实验[一二三四1-4]号?楼?)/.exec(roomName);
  if (mLab) return mLab[1]!;
  const dash = roomName.split(/[-—]/)[0];
  return dash && dash.length <= 10 ? dash : '其他教学楼';
}

type RawRecord = Record<string, unknown>;

const ROOM_ALIASES = {
  name: ['jxcdmc', 'cdmc', 'jsmc', 'jsm', 'roomName', 'name', '教室名称', '场地名称', '教室', '教学场地'],
  building: ['jxlmc', 'lhmc', 'building', '教学楼', '楼栋'],
  seats: ['zws', 'kszws', 'skzws', 'seats', 'capacity', '座位数', '容量'],
  roomType: ['cdlbmc', 'jslbmc', 'roomType', 'type', '教室类型', '场地类别'],
  campus: ['xqmc', 'campus', '校区'],
} as const;

function pickRoomField(rec: RawRecord, field: keyof typeof ROOM_ALIASES): string | null {
  const keys = Object.keys(rec);
  for (const alias of ROOM_ALIASES[field]) {
    const hit = keys.find((k) => k.toLowerCase() === alias.toLowerCase());
    if (hit !== undefined) {
      const val = clean(rec[hit]);
      if (val !== null) return val;
    }
  }
  return null;
}

function collectRoomJson(node: unknown, out: RawRecord[], depth = 0) {
  if (depth > 6 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectRoomJson(item, out, depth + 1);
    return;
  }
  const rec = node as RawRecord;
  if (pickRoomField(rec, 'name') !== null) {
    out.push(rec);
    return;
  }
  for (const val of Object.values(rec)) collectRoomJson(val, out, depth + 1);
}

function parseRoomHtml(html: string): RawRecord[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rows.length < 2) return [];
  const cellsOf = (r: string) => [...r.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => clean(m[1]) ?? '');
  const headerIdx = rows.findIndex((r) => cellsOf(r[1]!).some((c) => /教室|场地|名称/.test(c)));
  if (headerIdx < 0) return [];
  const headers = cellsOf(rows[headerIdx]![1]!);
  const out: RawRecord[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cells = cellsOf(rows[i]![1]!);
    if (cells.length < 1) continue;
    const rec: RawRecord = {};
    headers.forEach((h, idx) => {
      if (h && cells[idx] !== undefined) rec[h] = cells[idx];
    });
    if (pickRoomField(rec, 'name')) out.push(rec);
  }
  return out;
}

/** 解析广工教务空教室查询结果（JSON 或 HTML 表格） */
export function parseEmptyClassrooms(raw: string): EmptyClassroom[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let rawRecords: RawRecord[] = [];
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      collectRoomJson(JSON.parse(trimmed) as unknown, rawRecords);
    } catch {
      return [];
    }
  } else if (/<tr\b/i.test(trimmed)) {
    rawRecords = parseRoomHtml(trimmed);
  }

  const dedup = new Map<string, EmptyClassroom>();
  for (const rec of rawRecords) {
    const name = pickRoomField(rec, 'name');
    if (!name) continue;
    const building = inferBuildingGroup(name, pickRoomField(rec, 'building'));
    const seatsRaw = pickRoomField(rec, 'seats');
    const seatsNum = seatsRaw ? Number(seatsRaw.replace(/[^\d]/g, '')) : NaN;
    const seats = Number.isFinite(seatsNum) && seatsNum > 0 ? seatsNum : null;
    const matched = matchCampusBuilding(name) ?? matchCampusBuilding(building);

    dedup.set(name, {
      name,
      building,
      seats,
      roomType: pickRoomField(rec, 'roomType'),
      campus: pickRoomField(rec, 'campus'),
      mapBuildingId: matched?.id ?? null,
    });
  }

  return [...dedup.values()].sort(
    (a, b) => a.building.localeCompare(b.building, 'zh-CN') || a.name.localeCompare(b.name, 'zh-CN'),
  );
}

// ============================================================
// 广工校园常驻自习空间 & 实用百宝箱数据
// ============================================================

export interface StudySpot {
  id: string;
  name: string;
  area: string;
  hours: string;
  tip: string;
  mapQuery: string;
  tags: string[];
}

export const GDUT_STUDY_SPOTS: readonly StudySpot[] = [
  {
    id: 'lib',
    name: '大学城图书馆',
    area: '中环西路南侧核心区',
    hours: '08:00–22:30',
    tip: '二至七楼均有空调与插座，考试周建议提前通过图书馆公众号预约座位或研修室',
    mapQuery: '图书馆',
    tags: ['空调', '插座充足', '最安静'],
  },
  {
    id: 'teach34',
    name: '教学楼 3 / 4 号楼',
    area: '教学区中段',
    hours: '07:30–22:30',
    tip: '离一饭/二饭和图书馆都近，没课的教室默认开放通宵前自习，下课顺路最省时间',
    mapQuery: '教3',
    tags: ['免预约', '下课顺路', '有空调'],
  },
  {
    id: 'teach12',
    name: '教学楼 1 / 2 号楼',
    area: '教学区东侧',
    hours: '07:30–22:30',
    tip: '高层小教室通常更安静，适合刷题、线上会议或背诵',
    mapQuery: '教1',
    tags: ['免预约', '高层安静'],
  },
  {
    id: 'teach56',
    name: '教学楼 5 / 6 号楼',
    area: '教学区西侧',
    hours: '07:30–22:30',
    tip: '靠近生活西区和三饭/四饭，西区同学晚自习步行回宿舍最近',
    mapQuery: '教5',
    tags: ['近西区', '免预约'],
  },
  {
    id: 'big',
    name: '大教室（阶梯教室）',
    area: '教学区南侧',
    hours: '07:30–22:00',
    tip: '空间开阔座位多，适合午休间隙临时写作业或看网课',
    mapQuery: '大教室',
    tags: ['座位多', '免预约'],
  },
  {
    id: 'gong',
    name: '工学馆 / 实验楼公共区',
    area: '实验教学区',
    hours: '08:00–22:00',
    tip: '大厅与部分楼层设有讨论桌，适合小组讨论与做实验报告',
    mapQuery: '工学一号馆',
    tags: ['可讨论', '近实验楼'],
  },
];

export interface CampusServiceLink {
  id: string;
  category: 'digital' | 'transit' | 'life';
  title: string;
  subtitle: string;
  badge?: string;
  url?: string;
  phone?: string;
  mapQuery?: string;
  detail: string;
}

export const GDUT_CAMPUS_SERVICES: readonly CampusServiceLink[] = [
  // 学习与正版福利
  {
    id: 'software',
    category: 'digital',
    title: '广工正版软件平台',
    subtitle: 'Windows · Office · MATLAB · WPS 免费激活',
    badge: '学生福利',
    url: 'https://nic.gdut.edu.cn/',
    detail: '连接校园网或 VPN 后进入网络信息与现代教育技术中心，即可下载学校正版授权软件。',
  },
  {
    id: 'library-vpn',
    category: 'digital',
    title: '校外免费下论文（图书馆 / CARSI）',
    subtitle: '知网 CNKI · IEEE · Springer · 馆藏检索',
    badge: '写论文必备',
    url: 'https://library.gdut.edu.cn/',
    detail: '在校外可选择机构登录（CARSI）选「广东工业大学」用统一认证免费下载文献。',
  },
  {
    id: 'opac',
    category: 'digital',
    title: '图书馆馆藏检索（OPAC）',
    subtitle: '查书楼层、索书号与在馆状态',
    url: 'https://opac.gdut.edu.cn/',
    mapQuery: '图书馆',
    detail: '支持按书名、作者、ISBN 检索各校区馆藏与借阅到期状态。',
  },
  {
    id: 'ehall',
    category: 'digital',
    title: '网上办事大厅（一站式）',
    subtitle: '电费充值 · 请假 · 证明打印 · 校车查询',
    url: 'https://e.gdut.edu.cn/',
    detail: '广工统一融合门户，支持宿舍电费充值、成绩单/在读证明申请与后勤报修。',
  },
  {
    id: 'jwc',
    category: 'digital',
    title: '教务处官网 & 官方校历',
    subtitle: '选课通知 · 缓考/重修 · 转专业 · 保研政策',
    url: 'https://jwc.gdut.edu.cn/',
    detail: '教务处权威公告与每学年官方教学日历发布来源。',
  },
  {
    id: 'career',
    category: 'digital',
    title: '就业指导中心（宣讲会与招聘）',
    subtitle: '校招宣讲会 · 双选会 · 三方与实习',
    url: 'https://career.gdut.edu.cn/',
    detail: '汇总进校企业宣讲会时间地点与广工专属校招岗位。',
  },

  // 出行与校车
  {
    id: 'shuttle',
    category: 'transit',
    title: '广工跨校区校车查询',
    subtitle: '大学城 ↔ 东风路 / 龙洞 / 番禺校区',
    badge: '凭校园卡',
    url: 'https://e.gdut.edu.cn/',
    mapQuery: '行政楼',
    detail: '班次随每学期教学日历微调，可在网上办事大厅查看最新发车表并提前候车。',
  },
  {
    id: 'metro4',
    category: 'transit',
    title: '地铁 4 号线 · 大学城南站',
    subtitle: '往黄村末班约 23:15 · 往南沙客运港约 23:40',
    badge: '进市区最快',
    mapQuery: '大学城南',
    detail: '从广工东区/教学区骑行或坐 381/382 公交约 8–12 分钟直达大学城南地铁口（含 7 号线换乘）。',
  },
  {
    id: 'ring-bus',
    category: 'transit',
    title: '大学城环岛公交（381 / 382 / 番201）',
    subtitle: '中环西路与外环西路串联各高校、GOGO 与地铁口',
    detail: '晚间回校或去 GOGO 新天地、贝岗、广外/中大商圈首选，高峰期约 6–10 分钟一班。',
  },

  // 报修与电话黄页
  {
    id: 'nic-phone',
    category: 'life',
    title: '网络中心故障报修',
    subtitle: '08:00–21:30 · 实验 3 号楼 712 / 公众号 GDUTNIC',
    badge: '宽带/校园网',
    phone: '020-39323866',
    mapQuery: '实验三号楼',
    detail: '宿舍宽带掉线、认证异常、开户续费可直接致电或在「广东工业大学网络中心」微信报障。',
  },
  {
    id: 'security-phone',
    category: 'life',
    title: '保卫处值班电话（大学城）',
    subtitle: '校园应急安全 · 失物求助 · 证件咨询',
    badge: '应急',
    phone: '020-39322109',
    mapQuery: '保卫处',
    detail: '校内遇到突发安全状况、交通事故或紧急求助时请第一时间拨打。',
  },
  {
    id: 'hospital',
    category: 'life',
    title: '校医院（大学城门诊部）',
    subtitle: '24 小时医护值班 · 周四上午公费医保报销',
    badge: '24h 值班',
    mapQuery: '校医院',
    detail: '位于东区北侧紧邻一饭与东区服务中心，日常看病、开转诊单和体测突发不适可前往。',
  },
  {
    id: 'card-east',
    category: 'life',
    title: '校园卡服务点（东区 / 西区）',
    subtitle: '补卡 · 挂失 · 圈存异常 · 东十栋 / 西七栋一楼',
    phone: '020-39322360',
    mapQuery: '东十',
    detail: '东区东十栋西侧一楼（020-39322360）；西区西七栋西侧一楼（020-39322361）。',
  },
  {
    id: 'jwc-phone',
    category: 'life',
    title: '教务处学务科 / 教务科',
    subtitle: '学籍成绩 39322661 · 排课教室 39322660 · 行政楼 320',
    phone: '020-39322661',
    mapQuery: '行政楼',
    detail: '选课排课、教室借用咨询教务科（020-39322660）；成绩单、学籍异动咨询学务科（020-39322661）。',
  },
];

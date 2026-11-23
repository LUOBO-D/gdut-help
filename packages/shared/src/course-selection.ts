/**
 * 广东工业大学选课时间提醒模型、状态/倒计时引擎与教务选课时间探测解析器。
 */

export const SELECTION_KINDS = ['elective', 'pe', 'major', 'retake', 'other'] as const;
export type SelectionKind = (typeof SELECTION_KINDS)[number];

export const SELECTION_KIND_LABELS: Record<SelectionKind, string> = {
  elective: '公选抢课',
  pe: '体育选课',
  major: '专业正选',
  retake: '补退选/重修',
  other: '其他选课',
};

export const SELECTION_LEAD_OPTIONS = [
  { minutes: 1440, label: '提前 1 天' },
  { minutes: 60, label: '提前 1 小时' },
  { minutes: 30, label: '提前 30 分钟' },
  { minutes: 10, label: '提前 10 分钟' },
  { minutes: 5, label: '提前 5 分钟' },
] as const;

export const DEFAULT_SELECTION_LEADS: readonly number[] = [1440, 30, 5];

export interface CourseSelectionReminder {
  id: string;
  title: string;
  kind: SelectionKind;
  /** 开始时间 ISO（含时区） */
  startAt: string;
  /** 结束时间 ISO（可选） */
  endAt: string | null;
  enabled: boolean;
  /** 提前提醒分钟列表，如 [1440, 30, 5] */
  leadMinutes: number[];
  note: string | null;
  source: 'manual' | 'jw';
  createdAt: string;
}

export type CourseSelectionStatus = 'upcoming' | 'ongoing' | 'ended';

export function selectionStatus(
  item: Pick<CourseSelectionReminder, 'startAt' | 'endAt'>,
  now: Date = new Date(),
): CourseSelectionStatus {
  const nowMs = now.getTime();
  const startMs = new Date(item.startAt).getTime();
  if (nowMs < startMs) return 'upcoming';
  const endMs = item.endAt ? new Date(item.endAt).getTime() : startMs + 2 * 3600_000;
  if (nowMs <= endMs) return 'ongoing';
  return 'ended';
}

function formatDurationShort(ms: number): string {
  const totalMins = Math.max(1, Math.ceil(ms / 60_000));
  const days = Math.floor(totalMins / (24 * 60));
  const hours = Math.floor((totalMins % (24 * 60)) / 60);
  const mins = totalMins % 60;
  if (days >= 1) return hours > 0 ? `${days} 天 ${hours} 小时` : `${days} 天`;
  if (hours >= 1) return mins > 0 ? `${hours} 小时 ${mins} 分` : `${hours} 小时`;
  return `${mins} 分钟`;
}

export function selectionCountdownText(
  item: Pick<CourseSelectionReminder, 'startAt' | 'endAt'>,
  now: Date = new Date(),
): string {
  const status = selectionStatus(item, now);
  const nowMs = now.getTime();
  const startMs = new Date(item.startAt).getTime();

  if (status === 'ongoing') {
    if (item.endAt) {
      const left = new Date(item.endAt).getTime() - nowMs;
      return `选课进行中 · 距结束 ${formatDurationShort(left)}`;
    }
    return '选课进行中';
  }
  if (status === 'ended') return '已结束';

  const diff = startMs - nowMs;
  if (diff <= 60 * 60_000) return `${formatDurationShort(diff)}后开抢`;
  return `还剩 ${formatDurationShort(diff)}`;
}

/** 选出最紧迫的启用中轮次（进行中优先，其次最近即将开始） */
export function nextActiveSelection(
  items: readonly CourseSelectionReminder[],
  now: Date = new Date(),
): CourseSelectionReminder | null {
  const active = items
    .filter((i) => i.enabled && selectionStatus(i, now) !== 'ended')
    .sort((a, b) => {
      const sa = selectionStatus(a, now) === 'ongoing' ? 0 : 1;
      const sb = selectionStatus(b, now) === 'ongoing' ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
    });
  return active[0] ?? null;
}

export interface SelectionQuickTemplate {
  title: string;
  kind: SelectionKind;
  defaultTime: string;
  note: string;
}

export const GDUT_SELECTION_TEMPLATES: readonly SelectionQuickTemplate[] = [
  {
    title: '公共选修课正选（抢课）',
    kind: 'elective',
    defaultTime: '12:30',
    note: '建议提前 5 分钟登录教务并备好心仪公选课号',
  },
  {
    title: '体育选课',
    kind: 'pe',
    defaultTime: '12:30',
    note: '热门项目（羽毛球/游泳/瑜伽）名额紧俏，准点刷新',
  },
  {
    title: '专业课 / 培养方案正选',
    kind: 'major',
    defaultTime: '12:30',
    note: '核对班级推荐课表，确认实验课与理论课不冲突',
  },
  {
    title: '开学补退选',
    kind: 'retake',
    defaultTime: '12:30',
    note: '可捡漏退课释放名额，注意退选截止时间',
  },
];

export interface ParsedJwSelectionWindow {
  title: string;
  kind: SelectionKind;
  startAt: string;
  endAt: string | null;
  note: string | null;
}

function classifySelectionKind(title: string): SelectionKind {
  if (/体育/.test(title)) return 'pe';
  if (/公选|公共选修|通识/.test(title)) return 'elective';
  if (/补选|退选|补退|重修/.test(title)) return 'retake';
  if (/专业|正选|预选/.test(title)) return 'major';
  return 'other';
}

function toShanghaiIso(datePart: string, timePart: string): string | null {
  const dm = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(datePart);
  const tm = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(timePart);
  if (!dm) return null;
  const y = dm[1]!;
  const m = dm[2]!.padStart(2, '0');
  const d = dm[3]!.padStart(2, '0');
  const hh = (tm?.[1] ?? '12').padStart(2, '0');
  const mm = (tm?.[2] ?? '30').padStart(2, '0');
  const ss = (tm?.[3] ?? '00').padStart(2, '0');
  const iso = `${y}-${m}-${d}T${hh}:${mm}:${ss}+08:00`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

/**
 * 从广工教务选课页面 HTML 或 JSON 中自动提取选课时间窗口（如 "2026-12-21 12:30 至 2026-12-23 17:00"）。
 */
export function parseJwSelectionWindows(raw: string): ParsedJwSelectionWindow[] {
  const text = raw.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return [];

  const out: ParsedJwSelectionWindow[] = [];
  const seen = new Set<string>();

  const rangeRe =
    /([^\n，。；]{0,28}?(?:正选|预选|补退选|补选|退选|重修|公选|体育|选课)[^\n，。；]{0,20}?)?\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:至|到|~|—|-)+\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\s+(\d{1,2}:\d{2}(?::\d{2})?)/g;

  for (const m of text.matchAll(rangeRe)) {
    const startAt = toShanghaiIso(m[2]!, m[3]!);
    const endAt = toShanghaiIso(m[4]!, m[5]!);
    if (!startAt) continue;
    const rawTitle = (m[1] ?? '').replace(/^[\s:：,，;；\-—]+|[\s:：,，;；\-—]+$/g, '').trim();
    const title = rawTitle.length >= 2 && rawTitle.length <= 30 ? rawTitle : '广工教务选课时段';
    const key = `${title}|${startAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title,
      kind: classifySelectionKind(title),
      startAt,
      endAt,
      note: '同步自广工教务选课系统',
    });
  }

  return out;
}

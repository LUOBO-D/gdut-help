/**
 * 广东工业大学校区与作息时间。
 *
 * 坐标只用于查天气，精确到校区附近即可。
 * ⚠️ 作息时间是常见的 12 节模板，尚未与学校官方作息表核对（PERIODS_VERIFIED = false）。
 *    拿到官方作息后改这里，并把 PERIODS_VERIFIED 设为 true，界面上的「待核实」提示会消失。
 */

export interface Campus {
  id: string;
  name: string;
  /** 用于天气显示的地名 */
  area: string;
  lat: number;
  lng: number;
}

export const CAMPUSES: Campus[] = [
  { id: 'hemc', name: '大学城校区', area: '广州·番禺', lat: 23.04, lng: 113.4 },
  { id: 'dongfeng', name: '东风路校区', area: '广州·越秀', lat: 23.13, lng: 113.3 },
  { id: 'longdong', name: '龙洞校区', area: '广州·天河', lat: 23.2, lng: 113.37 },
  { id: 'jieyang', name: '揭阳校区', area: '揭阳', lat: 23.55, lng: 116.37 },
];

export const DEFAULT_CAMPUS_ID = 'hemc';

export function findCampus(id: string | null | undefined): Campus | undefined {
  return CAMPUSES.find((c) => c.id === id);
}

export interface ClassPeriod {
  /** 第几节，从 1 开始 */
  no: number;
  /** 24 小时制 HH:mm，北京时间 */
  start: string;
  end: string;
}

export const PERIODS_VERIFIED = false;

const TEMPLATE_PERIODS: ClassPeriod[] = [
  { no: 1, start: '08:30', end: '09:15' },
  { no: 2, start: '09:20', end: '10:05' },
  { no: 3, start: '10:25', end: '11:10' },
  { no: 4, start: '11:15', end: '12:00' },
  { no: 5, start: '13:50', end: '14:35' },
  { no: 6, start: '14:40', end: '15:25' },
  { no: 7, start: '15:30', end: '16:15' },
  { no: 8, start: '16:30', end: '17:15' },
  { no: 9, start: '17:20', end: '18:05' },
  { no: 10, start: '18:30', end: '19:15' },
  { no: 11, start: '19:20', end: '20:05' },
  { no: 12, start: '20:10', end: '20:55' },
];

/** 各校区作息。目前都用模板，核实后如有差异按校区分别填写 */
const CAMPUS_PERIODS: Record<string, ClassPeriod[]> = {};

export function periodsFor(campusId: string | null | undefined): ClassPeriod[] {
  return (campusId && CAMPUS_PERIODS[campusId]) || TEMPLATE_PERIODS;
}

export const MAX_PERIOD = 12;

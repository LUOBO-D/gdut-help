/**
 * 广工大学城 3D 校园地图昼夜光照系统。
 *
 * 按北京时间（Asia/Shanghai）自动切换清晨 / 白天 / 黄昏 / 夜晚的光照、天空、地面、路灯与楼宇窗灯；
 * 同时支持手动预览，方便白昼切换查看。
 */

export type MapTimeMode = 'auto' | 'dawn' | 'day' | 'dusk' | 'night';
export type ResolvedTimePhase = Exclude<MapTimeMode, 'auto'>;

export const MAP_TIME_MODE_LABELS: Record<MapTimeMode, string> = {
  auto: '随时间',
  dawn: '清晨',
  day: '白天',
  dusk: '黄昏',
  night: '夜晚',
};

export interface CampusLightingPalette {
  phase: ResolvedTimePhase;
  label: string;
  isDark: boolean;
  skyBg: string;
  fogColor: string;
  groundColor: string;
  parkColor: string;
  hillColor: string;
  waterColor: string;
  villageColor: string;
  plazaColor: string;
  courtColor: string;
  roadRingColor: string;
  roadMainColor: string;
  roadCampusColor: string;
  roadPathColor: string;
  bridgeColor: string;
  tunnelColor: string;
  ambientColor: string;
  ambientIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  sunColor: string;
  sunIntensity: number;
  sunPos: [number, number, number];
  /** 夜晚/黄昏窗灯发光强度（0~1） */
  windowGlow: number;
  /** 路灯光点透明度（0~1） */
  lampGlow: number;
  /** 建筑配色按功能分区 */
  buildingColors: {
    teaching: string;
    lab: string;
    'dorm-west': string;
    'dorm-east': string;
    canteen: string;
    landmark: string;
    sports: string;
  };
  routeColor: string;
  routeGlowColor: string;
}

/** 取北京时间的带小数小时（0–24） */
export function shanghaiHourFloat(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '12');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return (h % 24) + m / 60;
}

export function resolveTimePhase(mode: MapTimeMode, now: Date = new Date()): ResolvedTimePhase {
  if (mode !== 'auto') return mode;
  const h = shanghaiHourFloat(now);
  if (h >= 5.5 && h < 7.5) return 'dawn';
  if (h >= 7.5 && h < 17) return 'day';
  if (h >= 17 && h < 19.2) return 'dusk';
  return 'night';
}

const PALETTES: Record<ResolvedTimePhase, CampusLightingPalette> = {
  dawn: {
    phase: 'dawn',
    label: '清晨微光',
    isDark: false,
    skyBg: '#d8e3f5',
    fogColor: '#e2e7f4',
    groundColor: '#e4e8e3',
    parkColor: '#b4cfa8',
    hillColor: '#98bc8d',
    waterColor: '#7ebae3',
    villageColor: '#ddd7cf',
    plazaColor: '#ebe6de',
    courtColor: '#5da684',
    roadRingColor: '#f3cb8f',
    roadMainColor: '#f4f0e8',
    roadCampusColor: '#e6e3dc',
    roadPathColor: '#d9d3c8',
    bridgeColor: '#e0a96d',
    tunnelColor: '#6f92c8',
    ambientColor: '#ffdfc2',
    ambientIntensity: 0.72,
    hemiSky: '#c7d8ff',
    hemiGround: '#d8c5b2',
    hemiIntensity: 0.65,
    sunColor: '#ffc288',
    sunIntensity: 1.35,
    sunPos: [560, 260, 260],
    windowGlow: 0.14,
    lampGlow: 0.25,
    buildingColors: {
      teaching: '#e3ecf7',
      lab: '#d5e0f0',
      'dorm-west': '#f0dccb',
      'dorm-east': '#eed6c5',
      canteen: '#f7b28b',
      landmark: '#f6f2eb',
      sports: '#cfe4de',
    },
    routeColor: '#2563eb',
    routeGlowColor: '#60a5fa',
  },
  day: {
    phase: 'day',
    label: '日间清晰',
    isDark: false,
    skyBg: '#cde3fa',
    fogColor: '#d9eafb',
    groundColor: '#edf1ea',
    parkColor: '#b7dda7',
    hillColor: '#95c884',
    waterColor: '#5db9eb',
    villageColor: '#e2ddd4',
    plazaColor: '#f3efe6',
    courtColor: '#4da87d',
    roadRingColor: '#f7c978',
    roadMainColor: '#ffffff',
    roadCampusColor: '#e7ebf0',
    roadPathColor: '#dcd9d0',
    bridgeColor: '#e69f5c',
    tunnelColor: '#5889dc',
    ambientColor: '#ffffff',
    ambientIntensity: 0.82,
    hemiSky: '#e0f2fe',
    hemiGround: '#d4dec8',
    hemiIntensity: 0.65,
    sunColor: '#fff7e8',
    sunIntensity: 1.55,
    sunPos: [360, 560, 340],
    windowGlow: 0,
    lampGlow: 0,
    buildingColors: {
      teaching: '#e2eefc',
      lab: '#d2e2f7',
      'dorm-west': '#f4dfd0',
      'dorm-east': '#f0d8c7',
      canteen: '#ffaa82',
      landmark: '#faf7f2',
      sports: '#cae5dd',
    },
    routeColor: '#2563eb',
    routeGlowColor: '#38bdf8',
  },
  dusk: {
    phase: 'dusk',
    label: '日落黄昏',
    isDark: true,
    skyBg: '#3b4970',
    fogColor: '#5e5672',
    groundColor: '#2e3547',
    parkColor: '#2f4944',
    hillColor: '#26403c',
    waterColor: '#2f587d',
    villageColor: '#3c3e4d',
    plazaColor: '#45485a',
    courtColor: '#2e6257',
    roadRingColor: '#c9884f',
    roadMainColor: '#5b6378',
    roadCampusColor: '#474f63',
    roadPathColor: '#3f4759',
    bridgeColor: '#d99052',
    tunnelColor: '#6390d6',
    ambientColor: '#f2a882',
    ambientIntensity: 0.55,
    hemiSky: '#8c7ca8',
    hemiGround: '#322b3d',
    hemiIntensity: 0.55,
    sunColor: '#ff8e52',
    sunIntensity: 1.35,
    sunPos: [-580, 220, 220],
    windowGlow: 0.42,
    lampGlow: 0.65,
    buildingColors: {
      teaching: '#586985',
      lab: '#4d5d7a',
      'dorm-west': '#736168',
      'dorm-east': '#6e5c64',
      canteen: '#9e6859',
      landmark: '#787e91',
      sports: '#4b6d6c',
    },
    routeColor: '#38bdf8',
    routeGlowColor: '#7dd3fc',
  },
  night: {
    phase: 'night',
    label: '夜间模式',
    isDark: true,
    skyBg: '#0c1528',
    fogColor: '#111d36',
    groundColor: '#162238',
    parkColor: '#1a3a35',
    hillColor: '#183631',
    waterColor: '#1b3e68',
    villageColor: '#1f2b42',
    plazaColor: '#24344f',
    courtColor: '#1d4d46',
    roadRingColor: '#9c7848',
    roadMainColor: '#3e5275',
    roadCampusColor: '#2f4161',
    roadPathColor: '#273752',
    bridgeColor: '#d18e4f',
    tunnelColor: '#4882e0',
    ambientColor: '#93b8f0',
    ambientIntensity: 0.78,
    hemiSky: '#3b5d99',
    hemiGround: '#131f36',
    hemiIntensity: 0.68,
    sunColor: '#a8cbff',
    sunIntensity: 1.05,
    sunPos: [-320, 460, -280],
    windowGlow: 0.88,
    lampGlow: 1,
    buildingColors: {
      teaching: '#385178',
      lab: '#324a6e',
      'dorm-west': '#4c4669',
      'dorm-east': '#424d6e',
      canteen: '#7a4b45',
      landmark: '#476085',
      sports: '#2c595c',
    },
    routeColor: '#38bdf8',
    routeGlowColor: '#60a5fa',
  },
};

export function getCampusLighting(mode: MapTimeMode, now: Date = new Date()): CampusLightingPalette {
  return PALETTES[resolveTimePhase(mode, now)];
}

import { SCENES, type WeatherScene } from '@gduthelp/shared';

/** 主题场景与后端返回的天气场景一一对应 */
export { SCENES };
export type Scene = WeatherScene;

export const TIME_PHASES = ['dawn', 'day', 'dusk', 'night'] as const;
export type TimePhase = (typeof TIME_PHASES)[number];

export const TIME_PHASE_LABELS: Record<TimePhase, string> = {
  dawn: '清晨',
  day: '白天',
  dusk: '黄昏',
  night: '夜晚',
};

export interface SceneStyle {
  label: string;
  /** 天空背景渐变 */
  sky: string;
  /** 漂浮光斑颜色 */
  glows: [string, string, string];
  /** 浏览器地址栏 / 状态栏颜色 */
  themeColor: string;
}

/** 基准白天/默认场景配色（用于「我的 → 主题预览」色卡及默认回退） */
export const SCENE_STYLES: Record<Scene, SceneStyle> = {
  sunny: {
    label: '晴',
    sky: 'linear-gradient(165deg, #ffc27a 0%, #ff8f80 48%, #7aa6ff 100%)',
    glows: ['#ffe29a', '#ff9f7a', '#99b8ff'],
    themeColor: '#ffb57a',
  },
  cloudy: {
    label: '多云',
    sky: 'linear-gradient(170deg, #8bb8f8 0%, #b8e1fb 55%, #d9effc 100%)',
    glows: ['#ffffff', '#cce2ff', '#a8ccff'],
    themeColor: '#8fbdf8',
  },
  rain: {
    label: '雨',
    sky: 'linear-gradient(170deg, #3e5b99 0%, #233b6b 55%, #152442 100%)',
    glows: ['#38e1ff', '#5478cc', '#1d3569'],
    themeColor: '#36528c',
  },
  thunder: {
    label: '雷',
    sky: 'linear-gradient(170deg, #252736 0%, #443d59 55%, #1d1e2b 100%)',
    glows: ['#b388ff', '#4b4f75', '#27263a'],
    themeColor: '#252736',
  },
  snow: {
    label: '雪',
    sky: 'linear-gradient(170deg, #dce5f2 0%, #eef2f8 58%, #d4e0f0 100%)',
    glows: ['#ffffff', '#c5daf2', '#e4ecf7'],
    themeColor: '#dce5f2',
  },
  fog: {
    label: '雾',
    sky: 'linear-gradient(170deg, #cfd7e0 0%, #e7ecf2 60%, #d4dce6 100%)',
    glows: ['#ffffff', '#cfd6df', '#c2cbd6'],
    themeColor: '#cfd7e0',
  },
  night: {
    label: '夜',
    sky: 'linear-gradient(170deg, #0b1626 0%, #172e45 52%, #244861 100%)',
    glows: ['#c9d6ff', '#284a63', '#493c8c'],
    themeColor: '#0b1626',
  },
};

/** 结合「天气场景 × 北京时间段」生成实时动态天空渐变、光斑与状态栏主题色 */
export function resolveScenePalette(scene: Scene, phase: TimePhase): SceneStyle {
  const base = SCENE_STYLES[scene];

  if (scene === 'night') return base;

  if (phase === 'night') {
    switch (scene) {
      case 'sunny':
        return SCENE_STYLES.night;
      case 'cloudy':
        return {
          ...base,
          sky: 'linear-gradient(170deg, #101b30 0%, #1d2d4a 52%, #2c3f61 100%)',
          glows: ['#8ec5ff', '#314b75', '#1b2b4a'],
          themeColor: '#101b30',
        };
      case 'rain':
        return {
          ...base,
          sky: 'linear-gradient(170deg, #0a1426 0%, #142747 55%, #1d365c 100%)',
          glows: ['#38e1ff', '#234a80', '#10223f'],
          themeColor: '#0a1426',
        };
      case 'thunder':
        return {
          ...base,
          sky: 'linear-gradient(170deg, #11111c 0%, #241e38 55%, #161426 100%)',
          glows: ['#b388ff', '#3c2e66', '#1b1630'],
          themeColor: '#11111c',
        };
      case 'snow':
        return {
          ...base,
          sky: 'linear-gradient(170deg, #121f38 0%, #223557 55%, #344c73 100%)',
          glows: ['#d8ebff', '#4b6c9e', '#1c2f4f'],
          themeColor: '#121f38',
        };
      case 'fog':
        return {
          ...base,
          sky: 'linear-gradient(170deg, #18202c 0%, #283344 55%, #384659 100%)',
          glows: ['#b8c8db', '#3c4c63', '#1f2938'],
          themeColor: '#18202c',
        };
    }
  }

  if (phase === 'dusk') {
    switch (scene) {
      case 'sunny':
        return {
          ...base,
          sky: 'linear-gradient(168deg, #ff9955 0%, #d85a7f 48%, #3c356e 100%)',
          glows: ['#ffd08a', '#ff7b7b', '#6953a6'],
          themeColor: '#d85a7f',
        };
      case 'cloudy':
        return {
          ...base,
          sky: 'linear-gradient(170deg, #c97f85 0%, #6d6189 52%, #2f385c 100%)',
          glows: ['#ffb89c', '#8271a6', '#3c4973'],
          themeColor: '#6d6189',
        };
      case 'rain':
        return {
          ...base,
          sky: 'linear-gradient(170deg, #2e3b68 0%, #222c52 55%, #161c36 100%)',
          glows: ['#38e1ff', '#5e5fa8', '#1d274d'],
          themeColor: '#2e3b68',
        };
      case 'thunder':
        return {
          ...base,
          sky: 'linear-gradient(170deg, #232036 0%, #3a2e4f 55%, #1c192b 100%)',
          glows: ['#b388ff', '#5a3d7a', '#241e38'],
          themeColor: '#232036',
        };
      case 'fog':
        return {
          ...base,
          sky: 'linear-gradient(170deg, #b88c8c 0%, #6f6a82 55%, #393f54 100%)',
          glows: ['#f0c4b8', '#847b96', '#464e66'],
          themeColor: '#6f6a82',
        };
      case 'snow':
        return {
          ...base,
          sky: 'linear-gradient(170deg, #c99eb5 0%, #7d83ab 55%, #3f4b73 100%)',
          glows: ['#ffe3ec', '#9ba3cc', '#4f5d8a'],
          themeColor: '#7d83ab',
        };
    }
  }

  if (phase === 'dawn') {
    switch (scene) {
      case 'sunny':
        return {
          ...base,
          sky: 'linear-gradient(168deg, #ffcea3 0%, #f5a3c4 48%, #8bb4f8 100%)',
          glows: ['#ffe3b8', '#ffb3cf', '#a6c6ff'],
          themeColor: '#f5a3c4',
        };
      case 'cloudy':
        return {
          ...base,
          sky: 'linear-gradient(170deg, #e3bfd4 0%, #b5cff6 55%, #d6e7fc 100%)',
          glows: ['#fff0f5', '#c8dcfb', '#b8cff4'],
          themeColor: '#cfaecb',
        };
      case 'fog':
        return {
          ...base,
          sky: 'linear-gradient(170deg, #e6d4d8 0%, #d4dce8 60%, #e8edf2 100%)',
          glows: ['#fff5f5', '#dce3ed', '#cdd6e3'],
          themeColor: '#d9d2dc',
        };
      default:
        return base;
    }
  }

  return base;
}

/** 推算北京时间当前所处时段（有日出日落时间时按真实天光，否则按广州四季常见昼夜切分） */
export function resolveTimePhase(
  now: Date,
  sunriseIso?: string | null,
  sunsetIso?: string | null,
): TimePhase {
  const bj = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const mins = bj.getUTCHours() * 60 + bj.getUTCMinutes();

  const toBjMins = (iso: string | null | undefined): number | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const shifted = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  };

  const sunrise = toBjMins(sunriseIso) ?? 6 * 60 + 20;
  const sunset = toBjMins(sunsetIso) ?? 18 * 60 + 10;

  if (mins >= sunrise - 35 && mins < sunrise + 60) return 'dawn';
  if (mins >= sunrise + 60 && mins < sunset - 55) return 'day';
  if (mins >= sunset - 55 && mins < sunset + 30) return 'dusk';
  return 'night';
}

/** 没有天气数据时按北京时间选择场景：6 点到 18 点为晴，其余为夜。 */
export function sceneForTime(date: Date): Scene {
  const bj = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const h = bj.getUTCHours();
  return h >= 6 && h < 18 ? 'sunny' : 'night';
}

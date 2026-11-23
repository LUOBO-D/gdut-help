import type { Scene, TimePhase } from '../lib/scene';

export interface CloudLook {
  /** 显示的云团数量（受画质上限约束） */
  count: number;
  color: string;
  opacity: number;
  /** 云团整体缩放，雾天更大更散 */
  scale: number;
  /** 向右漂移速度（场景单位/秒） */
  speed: number;
}

export interface SkyConfig {
  /** 太阳亮度 0..1，0 表示不显示 */
  sun: number;
  clouds: CloudLook | null;
  /** 雨量倍数 0..1 */
  rain: number;
  snow: boolean;
  stars: boolean;
  moon: boolean;
  lightning: boolean;
}

const none: SkyConfig = { sun: 0, clouds: null, rain: 0, snow: false, stars: false, moon: false, lightning: false };

/** 每种天气由哪些 3D 元素组成。切换时各元素自己淡入淡出。 */
export const SKY_CONFIG: Record<Scene, SkyConfig> = {
  sunny: { ...none, sun: 1, clouds: { count: 4, color: '#ffffff', opacity: 0.6, scale: 0.9, speed: 0.12 } },
  cloudy: { ...none, sun: 0.35, clouds: { count: 10, color: '#f3f7ff', opacity: 0.75, scale: 1.1, speed: 0.1 } },
  rain: { ...none, rain: 1, clouds: { count: 9, color: '#56698f', opacity: 0.85, scale: 1.2, speed: 0.18 } },
  thunder: {
    ...none,
    rain: 1,
    lightning: true,
    clouds: { count: 10, color: '#3a3e52', opacity: 0.92, scale: 1.25, speed: 0.22 },
  },
  snow: { ...none, snow: true, clouds: { count: 6, color: '#eef2f8', opacity: 0.85, scale: 1.1, speed: 0.06 } },
  fog: { ...none, clouds: { count: 10, color: '#e4e9ef', opacity: 0.5, scale: 1.8, speed: 0.04 } },
  night: {
    ...none,
    stars: true,
    moon: true,
    clouds: { count: 3, color: '#30455f', opacity: 0.55, scale: 1, speed: 0.08 },
  },
};

/** 结合时间段动态微调 3D 天空元素（清晨暖云、黄昏夕阳云、夜晚星月与暗云） */
export function resolveSkyConfig(scene: Scene, timePhase: TimePhase): SkyConfig {
  const base = SKY_CONFIG[scene];
  if (scene === 'night') return base;

  if (timePhase === 'night') {
    const darkCloud = base.clouds
      ? {
          ...base.clouds,
          color: scene === 'thunder' ? '#242538' : scene === 'rain' ? '#2c3d61' : '#324869',
          opacity: Math.min(base.clouds.opacity, 0.72),
        }
      : null;
    const clearEnoughForSky = scene === 'sunny' || scene === 'cloudy' || scene === 'snow';
    return {
      ...base,
      sun: 0,
      stars: clearEnoughForSky,
      moon: scene === 'sunny' || scene === 'cloudy',
      clouds: darkCloud,
    };
  }

  if (timePhase === 'dusk') {
    const duskCloud = base.clouds
      ? {
          ...base.clouds,
          color: scene === 'rain' || scene === 'thunder' ? '#45476b' : '#f2b8a2',
        }
      : null;
    return {
      ...base,
      sun: base.sun > 0 ? Math.min(base.sun, 0.72) : 0,
      clouds: duskCloud,
    };
  }

  if (timePhase === 'dawn') {
    const dawnCloud = base.clouds
      ? {
          ...base.clouds,
          color: scene === 'rain' || scene === 'thunder' ? base.clouds.color : '#ffe5de',
        }
      : null;
    return {
      ...base,
      sun: base.sun > 0 ? Math.min(base.sun, 0.85) : 0,
      clouds: dawnCloud,
    };
  }

  return base;
}

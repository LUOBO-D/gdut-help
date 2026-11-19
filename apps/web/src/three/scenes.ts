import type { Scene } from '../lib/scene';

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

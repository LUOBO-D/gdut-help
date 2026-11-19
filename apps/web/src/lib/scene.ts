import { SCENES, type WeatherScene } from '@gduthelp/shared';

/** 主题场景与后端返回的天气场景一一对应 */
export { SCENES };
export type Scene = WeatherScene;

interface SceneStyle {
  label: string;
  /** 天空背景渐变 */
  sky: string;
  /** 漂浮光斑颜色（S1 由 3D 场景替代） */
  glows: [string, string, string];
  /** 浏览器地址栏 / 状态栏颜色 */
  themeColor: string;
}

export const SCENE_STYLES: Record<Scene, SceneStyle> = {
  sunny: {
    label: '晴',
    sky: 'linear-gradient(165deg, #ffc27a 0%, #ff8f80 48%, #8fb0ff 100%)',
    glows: ['#ffe29a', '#ff9f7a', '#a9c1ff'],
    themeColor: '#ffb57a',
  },
  cloudy: {
    label: '多云',
    sky: 'linear-gradient(170deg, #a1c4fd 0%, #c2e9fb 100%)',
    glows: ['#ffffff', '#d7e8ff', '#b9d4ff'],
    themeColor: '#a8c8fd',
  },
  rain: {
    label: '雨',
    sky: 'linear-gradient(170deg, #4b6cb7 0%, #182848 100%)',
    glows: ['#38e1ff', '#5b7fd6', '#203a74'],
    themeColor: '#3f5ea3',
  },
  thunder: {
    label: '雷',
    sky: 'linear-gradient(170deg, #2b2d33 0%, #4a4458 100%)',
    glows: ['#a66bff', '#4b4f70', '#2a2a3a'],
    themeColor: '#2c2e35',
  },
  snow: {
    label: '雪',
    sky: 'linear-gradient(170deg, #e6e9f0 0%, #eef1f5 60%, #dfe7f2 100%)',
    glows: ['#ffffff', '#cfe0f5', '#e8eefa'],
    themeColor: '#e6e9f0',
  },
  fog: {
    label: '雾',
    sky: 'linear-gradient(170deg, #d7dde4 0%, #eef1f5 100%)',
    glows: ['#ffffff', '#d5dbe3', '#c9d1db'],
    themeColor: '#d7dde4',
  },
  night: {
    label: '夜',
    sky: 'linear-gradient(170deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
    glows: ['#c9d6ff', '#2c5364', '#4b3f8f'],
    themeColor: '#0f2027',
  },
};

/** 没有天气数据时按时间选择场景：6 点到 18 点为晴，其余为夜。 */
export function sceneForTime(date: Date): Scene {
  const h = date.getHours();
  return h >= 6 && h < 18 ? 'sunny' : 'night';
}

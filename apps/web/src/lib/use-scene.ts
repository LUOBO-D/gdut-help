import type { WeatherReport } from '@gduthelp/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from './auth-store';
import { keys, useWeather } from './queries';
import {
  resolveScenePalette,
  resolveTimePhase,
  SCENE_STYLES,
  sceneForTime,
  type Scene,
  type TimePhase,
} from './scene';
import { useUi } from './ui-store';
import { useNow } from './use-now';

export interface ActiveAtmosphere {
  scene: Scene;
  timePhase: TimePhase;
}

/**
 * 当前全局氛围（实时天气 × 实时时间段）：
 * - 天气来源：手动预览 > 实时天气 > 缓存天气 > 时间回退；
 * - 时段来源：手动预览 > 实时北京时间（结合当日日出日落）；
 * - 实时同步到 <html data-scene="..." data-time="..."> 与状态栏 theme-color，驱动全站 UI 与动效变化。
 */
export function useScene(): ActiveAtmosphere {
  const override = useUi((s) => s.sceneOverride);
  const timeOverride = useUi((s) => s.timeOverride);
  const now = useNow(60_000);
  const weather = useWeather().data;
  const campusId = useAuth((s) => s.user?.campusId ?? null);
  const cached = useQueryClient().getQueryData<WeatherReport>(keys.weather(campusId));
  const report = weather ?? cached;

  const autoPhase = resolveTimePhase(now, report?.today.sunrise, report?.today.sunset);
  const timePhase: TimePhase =
    timeOverride ?? (override === 'night' ? 'night' : autoPhase);

  const fallbackScene = sceneForTime(now);
  const rawScene = override ?? report?.now.scene ?? fallbackScene;
  let scene: Scene = rawScene in SCENE_STYLES ? rawScene : fallbackScene;

  // 自动模式下校准昼夜与晴夜冲突（例如天气缓存来自昨夜或刚过日落时，立刻随当前时钟平滑切换）
  if (override === null) {
    if (scene === 'sunny' && timePhase === 'night') scene = 'night';
    else if (scene === 'night' && timePhase !== 'night') scene = 'sunny';
  }

  useEffect(() => {
    const palette = resolveScenePalette(scene, timePhase);
    document.documentElement.dataset.scene = scene;
    document.documentElement.dataset.time = timePhase;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.themeColor);
  }, [scene, timePhase]);

  return { scene, timePhase };
}

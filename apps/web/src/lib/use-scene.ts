import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { WeatherReport } from '@gduthelp/shared';
import { SCENE_STYLES, sceneForTime, type Scene } from './scene';
import { useAuth } from './auth-store';
import { keys, useWeather } from './queries';
import { useUi } from './ui-store';
import { useNow } from './use-now';

/** 当前场景：手动预览 > 实时天气 > 按时间；并同步到 <html data-scene> 和 theme-color。 */
export function useScene(): Scene {
  const override = useUi((s) => s.sceneOverride);
  const timeScene = sceneForTime(useNow());
  const weather = useWeather().data;
  // 登录页没有天气查询，用上次缓存的天气，保证登录前后场景一致
  const campusId = useAuth((s) => s.user?.campusId ?? null);
  const cached = useQueryClient().getQueryData<WeatherReport>(keys.weather(campusId));
  const rawScene = override ?? weather?.now.scene ?? cached?.now.scene ?? timeScene;
  const scene: Scene = rawScene in SCENE_STYLES ? rawScene : timeScene;

  useEffect(() => {
    document.documentElement.dataset.scene = scene;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', SCENE_STYLES[scene].themeColor);
  }, [scene]);

  return scene;
}

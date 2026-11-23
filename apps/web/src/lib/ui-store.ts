import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Scene, TimePhase } from './scene';

interface UiState {
  /** 「我的」页面里的天气场景预览；为 null 时自动跟随实时天气 */
  sceneOverride: Scene | null;
  /** 「我的」页面里的时段光影预览；为 null 时自动跟随北京时间与日出日落 */
  timeOverride: TimePhase | null;
  setSceneOverride: (scene: Scene | null) => void;
  setTimeOverride: (phase: TimePhase | null) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      sceneOverride: null,
      timeOverride: null,
      setSceneOverride: (sceneOverride) => set({ sceneOverride }),
      setTimeOverride: (timeOverride) => set({ timeOverride }),
    }),
    { name: 'gduthelp-ui' },
  ),
);

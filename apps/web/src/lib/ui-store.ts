import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Scene } from './scene';

interface UiState {
  /** 「我的」页面里的场景预览；为 null 时自动按天气/时间 */
  sceneOverride: Scene | null;
  setSceneOverride: (scene: Scene | null) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      sceneOverride: null,
      setSceneOverride: (sceneOverride) => set({ sceneOverride }),
    }),
    { name: 'gduthelp-ui' },
  ),
);

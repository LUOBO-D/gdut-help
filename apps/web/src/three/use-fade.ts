import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';

export const FADE_SECONDS = 1.2;

/** 从 current 向 target 移动，单步不超过 maxDelta */
export function moveTowards(current: number, target: number, maxDelta: number): number {
  return current < target ? Math.min(target, current + maxDelta) : Math.max(target, current - maxDelta);
}

/**
 * 元素的淡入淡出进度 0..1，每帧向目标推进。
 * 必须在组件自己的 useFrame 之前调用，这样同一帧里读到的是更新后的值。
 * instant 为 true（系统开启减少动态效果）时直接跳到目标值。
 */
export function useFade(active: boolean, instant: boolean) {
  const fade = useRef(0);
  useFrame((_, dt) => {
    const target = active ? 1 : 0;
    fade.current = instant ? target : moveTowards(fade.current, target, Math.min(dt, 0.1) / FADE_SECONDS);
  });
  return fade;
}

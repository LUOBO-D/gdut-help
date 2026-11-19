import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { MIN_FPS } from './quality';

const WINDOW_SECONDS = 3;

/**
 * 运行时帧率监测：按 3 秒窗口统计平均帧率，低于 MIN_FPS 时回调降档。
 * 第一个窗口包含着色器编译和资源上传，跳过不算；切到后台造成的长帧也不算。
 */
export function PerfWatch({ onSlow }: { onSlow: () => void }) {
  const acc = useRef({ time: 0, frames: 0, skip: 1 });
  useFrame((_, dt) => {
    const a = acc.current;
    if (dt > 0.5) {
      a.time = 0;
      a.frames = 0;
      return;
    }
    a.time += dt;
    a.frames++;
    if (a.time < WINDOW_SECONDS) return;
    const fps = a.frames / a.time;
    a.time = 0;
    a.frames = 0;
    if (a.skip > 0) a.skip--;
    else if (fps < MIN_FPS) onSlow();
  });
  return null;
}

import { useThree } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';

/** 在深度 z 处，相机能看到的宽高（场景单位）。用来把元素放到屏幕的相对位置上。 */
export function useViewAt(z: number): { width: number; height: number } {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const distance = camera.position.z - z;
  const height = 2 * distance * Math.tan((camera.fov * Math.PI) / 360);
  return { width: height * (size.width / size.height), height };
}

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { AdditiveBlending, type MeshBasicMaterial } from 'three';
import { skyInput } from '../sky-input';

/**
 * 闪电：每隔 4–11 秒一次快速双闪，照亮背景并让云层变亮。
 * 开启「减少动态效果」时不闪（instant 为 true）。
 */
export function Lightning({ active, instant }: { active: boolean; instant: boolean }) {
  const material = useRef<MeshBasicMaterial>(null);
  const next = useRef(3);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    let flash = 0;
    if (active && !instant) {
      const since = t - next.current;
      if (since > 0.6) next.current = t + 4 + Math.random() * 7;
      else if (since >= 0) flash = Math.exp(-since * 18) + (since > 0.18 ? Math.exp(-(since - 0.18) * 14) * 0.7 : 0);
    }
    skyInput.flash = Math.min(1, flash);
    material.current!.opacity = skyInput.flash * 0.45;
    material.current!.visible = skyInput.flash > 0.01;
  });

  return (
    <mesh position={[0, 2, -9]} renderOrder={2}>
      <planeGeometry args={[40, 30]} />
      <meshBasicMaterial ref={material} color="#d9d2ff" transparent depthWrite={false} blending={AdditiveBlending} opacity={0} />
    </mesh>
  );
}

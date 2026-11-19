import { useFrame } from '@react-three/fiber';
import { skyInput } from './sky-input';

/** 相机随视差输入轻微平移并始终看向原点，远近不同的元素因此错开，产生景深。 */
export function Rig() {
  useFrame(({ camera }, dt) => {
    const k = Math.min(1, dt * 3);
    camera.position.x += (skyInput.parallaxX * 0.7 - camera.position.x) * k;
    camera.position.y += (skyInput.parallaxY * 0.45 - camera.position.y) * k;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

import type { WeatherScene } from '@gduthelp/shared';
import { CloudIcon, FogIcon, MoonIcon, RainIcon, SnowIcon, SunIcon, ThunderIcon } from './icons';

const ICONS = {
  sunny: SunIcon,
  cloudy: CloudIcon,
  rain: RainIcon,
  thunder: ThunderIcon,
  snow: SnowIcon,
  fog: FogIcon,
  night: MoonIcon,
} satisfies Record<WeatherScene, unknown>;

export function WeatherIcon({ scene, size = 22 }: { scene: WeatherScene; size?: number }) {
  const Icon = ICONS[scene] ?? SunIcon;
  return <Icon size={size} />;
}

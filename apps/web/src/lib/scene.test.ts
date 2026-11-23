import { describe, expect, it } from 'vitest';
import { resolveScenePalette, resolveTimePhase, SCENE_STYLES } from './scene';

describe('resolveTimePhase', () => {
  const sunrise = '2026-11-23T06:40:00+08:00';
  const sunset = '2026-11-23T17:40:00+08:00';

  it('classifies Beijing dawn, day, dusk, and night using sunrise/sunset', () => {
    expect(resolveTimePhase(new Date('2026-11-23T06:30:00+08:00'), sunrise, sunset)).toBe('dawn');
    expect(resolveTimePhase(new Date('2026-11-23T12:00:00+08:00'), sunrise, sunset)).toBe('day');
    expect(resolveTimePhase(new Date('2026-11-23T17:20:00+08:00'), sunrise, sunset)).toBe('dusk');
    expect(resolveTimePhase(new Date('2026-11-23T22:30:00+08:00'), sunrise, sunset)).toBe('night');
    expect(resolveTimePhase(new Date('2026-11-23T03:00:00+08:00'), sunrise, sunset)).toBe('night');
  });

  it('falls back to default Guangzhou sunrise/sunset when weather has none', () => {
    expect(resolveTimePhase(new Date('2026-11-23T06:15:00+08:00'))).toBe('dawn');
    expect(resolveTimePhase(new Date('2026-11-23T14:00:00+08:00'))).toBe('day');
    expect(resolveTimePhase(new Date('2026-11-23T18:00:00+08:00'))).toBe('dusk');
    expect(resolveTimePhase(new Date('2026-11-23T23:00:00+08:00'))).toBe('night');
  });
});

describe('resolveScenePalette', () => {
  it('adapts cloudy, rain, and sunny skies by time phase', () => {
    const dayCloudy = resolveScenePalette('cloudy', 'day');
    const duskCloudy = resolveScenePalette('cloudy', 'dusk');
    const nightCloudy = resolveScenePalette('cloudy', 'night');
    expect(dayCloudy.sky).toBe(SCENE_STYLES.cloudy.sky);
    expect(duskCloudy.sky).not.toBe(dayCloudy.sky);
    expect(nightCloudy.sky).not.toBe(dayCloudy.sky);
    expect(nightCloudy.themeColor).not.toBe(dayCloudy.themeColor);

    const dayRain = resolveScenePalette('rain', 'day');
    const nightRain = resolveScenePalette('rain', 'night');
    expect(nightRain.sky).not.toBe(dayRain.sky);

    expect(resolveScenePalette('sunny', 'night').sky).toBe(SCENE_STYLES.night.sky);
  });
});

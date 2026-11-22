import { describe, expect, it } from 'vitest';
import { getCampusLighting, resolveTimePhase } from './campus-lighting';

describe('campus 3D map time-of-day lighting', () => {
  it('resolves Beijing time into dawn, day, dusk, and night phases accurately', () => {
    expect(resolveTimePhase('auto', new Date('2026-11-22T06:30:00+08:00'))).toBe('dawn');
    expect(resolveTimePhase('auto', new Date('2026-11-22T12:00:00+08:00'))).toBe('day');
    expect(resolveTimePhase('auto', new Date('2026-11-22T18:00:00+08:00'))).toBe('dusk');
    expect(resolveTimePhase('auto', new Date('2026-11-22T22:30:00+08:00'))).toBe('night');
    expect(resolveTimePhase('auto', new Date('2026-11-22T02:00:00+08:00'))).toBe('night');
  });

  it('activates dark theme, window glow, and streetlights at night, and disables them in daytime', () => {
    const day = getCampusLighting('day');
    expect(day.isDark).toBe(false);
    expect(day.windowGlow).toBe(0);
    expect(day.lampGlow).toBe(0);

    const night = getCampusLighting('night');
    expect(night.isDark).toBe(true);
    expect(night.windowGlow).toBeGreaterThan(0.5);
    expect(night.lampGlow).toBeGreaterThan(0.5);
  });
});

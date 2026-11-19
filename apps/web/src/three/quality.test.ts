import { describe, expect, it } from 'vitest';
import { lowerQuality, minQuality } from './quality';
import { effectiveQuality } from './quality-store';

describe('quality tiers', () => {
  it('steps down one tier and stops at low', () => {
    expect(lowerQuality('high')).toBe('medium');
    expect(lowerQuality('medium')).toBe('low');
    expect(lowerQuality('low')).toBe('low');
  });

  it('picks the lower of two tiers', () => {
    expect(minQuality('high', 'medium')).toBe('medium');
    expect(minQuality('low', 'high')).toBe('low');
  });
});

describe('effectiveQuality', () => {
  it('uses a manual preference as-is, ignoring detection and the runtime cap', () => {
    expect(effectiveQuality({ preference: 'high', detected: 'low', cap: 'low' })).toBe('high');
  });

  it('waits for detection in auto mode', () => {
    expect(effectiveQuality({ preference: 'auto', detected: null, cap: null })).toBeNull();
  });

  it('applies the runtime cap in auto mode, never raising the detected tier', () => {
    expect(effectiveQuality({ preference: 'auto', detected: 'high', cap: 'medium' })).toBe('medium');
    expect(effectiveQuality({ preference: 'auto', detected: 'medium', cap: 'high' })).toBe('medium');
    expect(effectiveQuality({ preference: 'auto', detected: 'high', cap: null })).toBe('high');
  });
});

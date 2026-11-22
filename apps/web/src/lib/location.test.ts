import { describe, expect, it } from 'vitest';
import { acceptAndSmoothFix, approxMetersBetween, type GeoFix } from './location';

const BASE_TIME = 1_760_000_000_000;

function makeFix(overrides: Partial<GeoFix> = {}): GeoFix {
  return {
    lat: 23.040127,
    lng: 113.389745,
    accuracy: 12,
    heading: 90,
    timestamp: BASE_TIME,
    quality: 'precise',
    ...overrides,
  };
}

describe('location fix quality filter & smoother', () => {
  it('rejects invalid or null-island coordinates', () => {
    expect(acceptAndSmoothFix(null, makeFix({ lat: 0, lng: 0 }))).toBeNull();
    expect(acceptAndSmoothFix(null, makeFix({ lat: Number.NaN }))).toBeNull();
  });

  it('rejects stale out-of-order fixes', () => {
    const prev = makeFix({ timestamp: BASE_TIME + 5_000 });
    const older = makeFix({ timestamp: BASE_TIME });
    expect(acceptAndSmoothFix(prev, older)).toBeNull();
  });

  it('rejects sudden coarse cell/Wi-Fi fallback jumps while locked onto accurate GNSS', () => {
    const locked = makeFix({ lat: 23.040127, lng: 113.389745, accuracy: 12, timestamp: BASE_TIME });
    const noisyFallback = makeFix({
      lat: 23.0412,
      lng: 113.3908,
      accuracy: 140,
      timestamp: BASE_TIME + 4_000,
      quality: 'fast',
    });
    expect(acceptAndSmoothFix(locked, noisyFallback)).toBeNull();
  });

  it('snaps immediately without lag when upgrading from coarse indoor fix to GNSS lock', () => {
    const coarse = makeFix({ lat: 23.0410, lng: 113.3905, accuracy: 85, timestamp: BASE_TIME, quality: 'fast' });
    const gnss = makeFix({ lat: 23.040127, lng: 113.389745, accuracy: 10, timestamp: BASE_TIME + 2_000 });
    const result = acceptAndSmoothFix(coarse, gnss);
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(gnss.lat, 6);
    expect(result!.lng).toBeCloseTo(gnss.lng, 6);
  });

  it('damps tiny stationary GNSS wobble (< 3.5m) while staying responsive when walking', () => {
    const prev = makeFix({ lat: 23.040127, lng: 113.389745, accuracy: 12, timestamp: BASE_TIME });
    // ~2.2m north jitter
    const jitter = makeFix({ lat: 23.040147, lng: 113.389745, accuracy: 12, timestamp: BASE_TIME + 2_000 });
    const damped = acceptAndSmoothFix(prev, jitter)!;
    expect(approxMetersBetween(prev, damped)).toBeLessThan(1.2);

    // ~15m east walking step with crisp GNSS accuracy
    const walked = makeFix({ lat: 23.040127, lng: 113.389892, accuracy: 10, timestamp: BASE_TIME + 4_000 });
    const moved = acceptAndSmoothFix(prev, walked)!;
    expect(moved.lng).toBeCloseTo(walked.lng, 6);
  });

  it('rejects impossible high-speed teleport glitches with degraded accuracy', () => {
    const prev = makeFix({ lat: 23.040127, lng: 113.389745, accuracy: 20, timestamp: BASE_TIME });
    // ~400m jump in 1s with 80m error
    const spike = makeFix({ lat: 23.0437, lng: 113.389745, accuracy: 80, timestamp: BASE_TIME + 1_000 });
    expect(acceptAndSmoothFix(prev, spike)).toBeNull();
  });
});

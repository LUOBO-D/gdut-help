import { describe, expect, it } from 'vitest';
import {
  acceptAndSmoothFix,
  approxMetersBetween,
  computeBearingDeg,
  smoothAngleDeg,
  type GeoFix,
} from './location';

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

describe('location fix quality filter, bearing & smoother', () => {
  it('computes cardinal compass bearings accurately (0=N, 90=E, 180=S, 270=W)', () => {
    const origin = { lat: 23.040127, lng: 113.389745 };
    expect(computeBearingDeg(origin, { lat: origin.lat + 0.001, lng: origin.lng })).toBeCloseTo(0, 1);
    expect(computeBearingDeg(origin, { lat: origin.lat, lng: origin.lng + 0.001 })).toBeCloseTo(90, 1);
    expect(computeBearingDeg(origin, { lat: origin.lat - 0.001, lng: origin.lng })).toBeCloseTo(180, 1);
    expect(computeBearingDeg(origin, { lat: origin.lat, lng: origin.lng - 0.001 })).toBeCloseTo(270, 1);
  });

  it('smooths compass angles along shortest arc across 0/360 boundary', () => {
    const clockwise = smoothAngleDeg(355, 5, 0.5);
    expect(clockwise).toBeCloseTo(0, 5);
    const counter = smoothAngleDeg(5, 355, 0.5);
    expect(counter).toBeCloseTo(0, 5);
  });

  it('rejects invalid or null-island coordinates', () => {
    expect(acceptAndSmoothFix(null, makeFix({ lat: 0, lng: 0 }))).toBeNull();
    expect(acceptAndSmoothFix(null, makeFix({ lat: Number.NaN }))).toBeNull();
  });

  it('rejects genuinely ancient cached fixes (> 15s older) while tolerating minor Android GPS clock skew', () => {
    const prev = makeFix({ timestamp: BASE_TIME + 20_000 });
    expect(acceptAndSmoothFix(prev, makeFix({ timestamp: BASE_TIME }))).toBeNull();

    // 4-second GPS-vs-network clock skew should NOT drop live fixes
    const slightSkew = acceptAndSmoothFix(
      prev,
      makeFix({ lat: 23.04025, timestamp: BASE_TIME + 16_000 }),
    );
    expect(slightSkew).not.toBeNull();
    expect(slightSkew!.timestamp).toBe(prev.timestamp);
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

  it('derives forward walking bearing automatically when GPS heading is unavailable', () => {
    const start = makeFix({ lat: 23.040127, lng: 113.389745, heading: null, timestamp: BASE_TIME });
    // Walk ~15m due south (180°)
    const south = makeFix({ lat: 23.03999, lng: 113.389745, heading: null, timestamp: BASE_TIME + 3_000 });
    const next = acceptAndSmoothFix(start, south)!;
    expect(next.heading).not.toBeNull();
    expect(next.heading!).toBeCloseTo(180, 1);
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
    const spike = makeFix({ lat: 23.0437, lng: 113.389745, accuracy: 80, timestamp: BASE_TIME + 1_000 });
    expect(acceptAndSmoothFix(prev, spike)).toBeNull();
  });
});

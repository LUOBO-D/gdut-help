import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import * as providers from './providers.js';
import { WeatherService } from './weather.service.js';

const mockReport: providers.ProviderReport = {
  source: 'open-meteo',
  attribution: 'Open-Meteo',
  now: { temp: 24, feelsLike: 25, text: '晴', scene: 'sunny', humidity: 60 },
  today: { min: 19, max: 27, pop: 10, sunrise: null, sunset: null },
  hourly: [],
};

describe('WeatherService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('首次冷启动并发请求同一坐标时只向上游发一次请求', async () => {
    let resolveFetch!: (v: providers.ProviderReport) => void;
    const spy = vi.spyOn(providers, 'fetchOpenMeteo').mockImplementation(
      () => new Promise((r) => { resolveFetch = r; }),
    );
    const service = new WeatherService({ QWEATHER_API_HOST: '', QWEATHER_API_KEY: '' } as Env);

    const p1 = service.get(23.04, 113.4, '大学城');
    const p2 = service.get(23.041, 113.401, '大学城');
    resolveFetch(mockReport);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(r1.now.temp).toBe(24);
    expect(r2.stale).toBe(false);
  });

  it('超过缓存容量上限时自动淘汰旧条目，防止内存无限增长', async () => {
    vi.spyOn(providers, 'fetchOpenMeteo').mockResolvedValue(mockReport);
    const service = new WeatherService({ QWEATHER_API_HOST: '', QWEATHER_API_KEY: '' } as Env);

    for (let i = 0; i < 120; i++) {
      await service.get(20 + i * 0.05, 113, `loc-${i}`);
    }

    const internalCache = (service as unknown as { cache: Map<string, unknown> }).cache;
    expect(internalCache.size).toBeLessThanOrEqual(100);
  });
});

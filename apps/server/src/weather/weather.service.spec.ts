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
    vi.useFakeTimers();
    try {
      vi.spyOn(providers, 'fetchOpenMeteo').mockResolvedValue(mockReport);
      const service = new WeatherService({ QWEATHER_API_HOST: '', QWEATHER_API_KEY: '' } as Env);

      for (let i = 0; i < 120; i++) {
        if (i > 0 && i % 15 === 0) vi.advanceTimersByTime(61_000);
        await service.get(20 + i * 0.05, 113, `loc-${i}`);
      }

      const internalCache = (service as unknown as { cache: Map<string, unknown> }).cache;
      expect(internalCache.size).toBeLessThanOrEqual(100);
    } finally {
      vi.useRealTimers();
    }
  });

  it('单分钟大量随机自定义坐标请求触发防刷熔断，优雅回退至默认校区天气', async () => {
    const spy = vi.spyOn(providers, 'fetchOpenMeteo').mockResolvedValue(mockReport);
    const service = new WeatherService({ QWEATHER_API_HOST: '', QWEATHER_API_KEY: '' } as Env);
    // 先预热大学城校区天气
    await service.get(23.04, 113.4, '大学城');
    for (let i = 0; i < 20; i++) {
      const r = await service.get(25 + i * 0.1, 110 + i * 0.1, `rand-${i}`);
      expect(r.now.temp).toBe(24);
    }
    // 1 次校区预热 + 最多 15 次自定义坐标上游调用
    expect(spy).toHaveBeenCalledTimes(16);
  });

  it('缓存过 10 分钟但仍在 6 小时内时启用 SWR 立即返回旧缓存并后台刷新', async () => {
    let resolveRefresh!: (v: providers.ProviderReport) => void;
    const spy = vi
      .spyOn(providers, 'fetchOpenMeteo')
      .mockResolvedValueOnce(mockReport)
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolveRefresh = r;
          }),
      );
    const service = new WeatherService({ QWEATHER_API_HOST: '', QWEATHER_API_KEY: '' } as Env);

    await service.get(23.04, 113.4, '大学城');
    // 人为把缓存时间戳回拨 20 分钟（常规 SWR 窗口：静默返回旧值不误报 stale，同时触发后台刷新）
    const cache = (service as unknown as { cache: Map<string, { report: providers.ProviderReport; fetchedAt: number }> }).cache;
    const key = '23.04,113.40';
    cache.set(key, { report: mockReport, fetchedAt: Date.now() - 20 * 60_000 });

    // SWR 应立即返回（不阻塞等待 resolveRefresh）
    const swrRes = await service.get(23.04, 113.4, '大学城');
    expect(swrRes.stale).toBe(false);
    expect(swrRes.now.temp).toBe(24);
    expect(spy).toHaveBeenCalledTimes(2);

    // 后台刷新完成后下次请求拿到新温度
    resolveRefresh({ ...mockReport, now: { ...mockReport.now, temp: 28 } });
    await new Promise((r) => setTimeout(r, 0));
    const fresh = await service.get(23.04, 113.4, '大学城');
    expect(fresh.stale).toBe(false);
    expect(fresh.now.temp).toBe(28);
  });

  it('Open-Meteo 失败时自动回退到 MET Norway 备用源', async () => {
    vi.spyOn(providers, 'fetchOpenMeteo').mockRejectedValueOnce(new Error('timeout'));
    const fallbackSpy = vi.spyOn(providers, 'fetchMetNo').mockResolvedValueOnce({
      ...mockReport,
      source: 'met-no',
      now: { ...mockReport.now, temp: 22 },
    });
    const service = new WeatherService({ QWEATHER_API_HOST: '', QWEATHER_API_KEY: '' } as Env);

    const res = await service.get(23.04, 113.4, '大学城');
    expect(fallbackSpy).toHaveBeenCalledTimes(1);
    expect(res.source).toBe('met-no');
    expect(res.now.temp).toBe(22);
  });
});

import { HttpStatus, Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DEFAULT_CAMPUS_ID, ErrorCode, findCampus, type WeatherReport } from '@gduthelp/shared';
import { AppException } from '../common/app.exception.js';
import { ENV, type Env } from '../config/env.js';
import { fetchMetNo, fetchOpenMeteo, fetchQWeather, type ProviderReport } from './providers.js';

/** 缓存 10 分钟。所有用户共享，同一校区一天只请求上百次以内 */
const TTL_MS = 10 * 60 * 1000;
/** 后台定时预热默认校区天气（每 9 分钟），保证打开 App 时永远命中热缓存 */
const WARMUP_INTERVAL_MS = 9 * 60 * 1000;
/** 超过 30 分钟仍未刷新成功时才向前端提示 stale（常规 10-30 分钟 SWR 刷新静默进行，不误报服务不可用） */
const STALE_WARN_MS = 30 * 60 * 1000;
/** 数据源失败或 SWR 后台刷新期间，旧数据最多再用 6 小时 */
const STALE_MAX_MS = 6 * 60 * 60 * 1000;
/** 进程内缓存上限，防止随机坐标查询导致内存无限增长 */
const MAX_CACHE_ENTRIES = 100;

interface Entry {
  report: ProviderReport;
  fetchedAt: number;
}

@Injectable()
export class WeatherService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WeatherService.name);
  private readonly cache = new Map<string, Entry>();
  /** 独立维护冷启动/过期刷新的在途请求，避免缓存为空时并发击穿 */
  private readonly inflight = new Map<string, Promise<ProviderReport>>();
  private warmupTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    const warm = async (retriesLeft = 0) => {
      const campus = findCampus(DEFAULT_CAMPUS_ID);
      if (!campus) return;
      const key = `${campus.lat.toFixed(2)},${campus.lng.toFixed(2)}`;
      const ok = await this.refreshInBackground(key, campus.lat, campus.lng);
      if (!ok && retriesLeft > 0) {
        this.retryTimer = setTimeout(() => void warm(retriesLeft - 1), 15_000);
        this.retryTimer.unref();
      }
    };
    void warm(3);
    this.warmupTimer = setInterval(() => void warm(0), WARMUP_INTERVAL_MS);
    this.warmupTimer.unref();
  }

  onModuleDestroy() {
    if (this.warmupTimer) clearInterval(this.warmupTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  async get(lat: number, lng: number, location: string): Promise<WeatherReport> {
    // 坐标保留两位小数（约 1 公里），附近的请求共用缓存
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const entry = this.cache.get(key);
    const now = Date.now();
    const age = entry ? now - entry.fetchedAt : Infinity;
    if (entry && age < TTL_MS) return this.toReport(entry, location, false);

    // SWR（Stale-While-Revalidate）：6 小时内有旧缓存时立即毫秒级返回，同时后台静默刷新，彻底避免前端死等上游接口
    if (entry && age < STALE_MAX_MS) {
      void this.refreshInBackground(key, lat, lng);
      return this.toReport(entry, location, age >= STALE_WARN_MS);
    }

    try {
      const report = await this.fetchOnce(key, lat, lng);
      const fresh: Entry = { report, fetchedAt: Date.now() };
      this.store(key, fresh);
      return this.toReport(fresh, location, false);
    } catch (err) {
      this.logger.warn(`获取天气失败（${key}）：${err instanceof Error ? err.message : String(err)}`);
      if (entry && age < STALE_MAX_MS) return this.toReport(entry, location, true);
      throw new AppException(ErrorCode.INTERNAL_ERROR, '天气服务暂时不可用', HttpStatus.BAD_GATEWAY);
    }
  }

  private async refreshInBackground(key: string, lat: number, lng: number): Promise<boolean> {
    try {
      const report = await this.fetchOnce(key, lat, lng);
      this.store(key, { report, fetchedAt: Date.now() });
      return true;
    } catch (err) {
      this.logger.warn(`后台刷新天气失败（${key}）：${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /** 同一地点的并发请求只发一次（包含首次冷启动） */
  private fetchOnce(key: string, lat: number, lng: number): Promise<ProviderReport> {
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const pending = this.fetchProvider(lat, lng).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, pending);
    return pending;
  }

  private store(key: string, entry: Entry) {
    // 先刷新写入顺序（Map 保持插入顺序，便于淘汰最久未更新的条目）
    this.cache.delete(key);
    this.cache.set(key, entry);
    if (this.cache.size <= MAX_CACHE_ENTRIES) return;
    const now = Date.now();
    for (const [k, v] of this.cache) {
      if (now - v.fetchedAt > STALE_MAX_MS) this.cache.delete(k);
      if (this.cache.size <= MAX_CACHE_ENTRIES) return;
    }
    while (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private async fetchProvider(lat: number, lng: number): Promise<ProviderReport> {
    const { QWEATHER_API_HOST: host, QWEATHER_API_KEY: key } = this.env;
    if (host && key) return fetchQWeather(host, key, lat, lng);
    try {
      return await fetchOpenMeteo(lat, lng);
    } catch (err) {
      this.logger.warn(`Open-Meteo 请求失败，自动切换 MET Norway 备用源：${err instanceof Error ? err.message : String(err)}`);
      return fetchMetNo(lat, lng);
    }
  }

  private toReport(entry: Entry, location: string, stale: boolean): WeatherReport {
    return { ...entry.report, location, stale, fetchedAt: new Date(entry.fetchedAt).toISOString() };
  }
}

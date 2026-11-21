import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode, type WeatherReport } from '@gduthelp/shared';
import { AppException } from '../common/app.exception.js';
import { ENV, type Env } from '../config/env.js';
import { fetchOpenMeteo, fetchQWeather, type ProviderReport } from './providers.js';

/** 缓存 10 分钟。所有用户共享，同一校区一天只请求上百次以内 */
const TTL_MS = 10 * 60 * 1000;
/** 数据源失败时，旧数据最多再用 6 小时 */
const STALE_MAX_MS = 6 * 60 * 60 * 1000;
/** 进程内缓存上限，防止随机坐标查询导致内存无限增长 */
const MAX_CACHE_ENTRIES = 100;

interface Entry {
  report: ProviderReport;
  fetchedAt: number;
}

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly cache = new Map<string, Entry>();
  /** 独立维护冷启动/过期刷新的在途请求，避免缓存为空时并发击穿 */
  private readonly inflight = new Map<string, Promise<ProviderReport>>();

  constructor(@Inject(ENV) private readonly env: Env) {}

  async get(lat: number, lng: number, location: string): Promise<WeatherReport> {
    // 坐标保留两位小数（约 1 公里），附近的请求共用缓存
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const entry = this.cache.get(key);
    const now = Date.now();
    const age = entry ? now - entry.fetchedAt : Infinity;
    if (entry && age < TTL_MS) return this.toReport(entry, location, false);

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

  private fetchProvider(lat: number, lng: number): Promise<ProviderReport> {
    const { QWEATHER_API_HOST: host, QWEATHER_API_KEY: key } = this.env;
    return host && key ? fetchQWeather(host, key, lat, lng) : fetchOpenMeteo(lat, lng);
  }

  private toReport(entry: Entry, location: string, stale: boolean): WeatherReport {
    return { ...entry.report, location, stale, fetchedAt: new Date(entry.fetchedAt).toISOString() };
  }
}

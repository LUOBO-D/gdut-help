import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode, type WeatherReport } from '@gduthelp/shared';
import { AppException } from '../common/app.exception.js';
import { ENV, type Env } from '../config/env.js';
import { fetchOpenMeteo, fetchQWeather, type ProviderReport } from './providers.js';

/** 缓存 10 分钟。所有用户共享，同一校区一天只请求上百次以内 */
const TTL_MS = 10 * 60 * 1000;
/** 数据源失败时，旧数据最多再用 6 小时 */
const STALE_MAX_MS = 6 * 60 * 60 * 1000;

interface Entry {
  report: ProviderReport;
  fetchedAt: number;
  pending?: Promise<ProviderReport>;
}

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly cache = new Map<string, Entry>();

  constructor(@Inject(ENV) private readonly env: Env) {}

  async get(lat: number, lng: number, location: string): Promise<WeatherReport> {
    // 坐标保留两位小数（约 1 公里），附近的请求共用缓存
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const entry = this.cache.get(key);
    const age = entry ? Date.now() - entry.fetchedAt : Infinity;
    if (entry && age < TTL_MS) return this.toReport(entry, location, false);

    try {
      const report = await this.fetchOnce(key, lat, lng);
      const fresh = { report, fetchedAt: Date.now() };
      this.cache.set(key, fresh);
      return this.toReport(fresh, location, false);
    } catch (err) {
      this.logger.warn(`获取天气失败（${key}）：${err instanceof Error ? err.message : String(err)}`);
      if (entry && age < STALE_MAX_MS) return this.toReport(entry, location, true);
      throw new AppException(ErrorCode.INTERNAL_ERROR, '天气服务暂时不可用', HttpStatus.BAD_GATEWAY);
    }
  }

  /** 同一地点的并发请求只发一次 */
  private fetchOnce(key: string, lat: number, lng: number): Promise<ProviderReport> {
    const entry = this.cache.get(key);
    if (entry?.pending) return entry.pending;
    const pending = this.fetchProvider(lat, lng).finally(() => {
      const e = this.cache.get(key);
      if (e) delete e.pending;
    });
    if (entry) entry.pending = pending;
    return pending;
  }

  private fetchProvider(lat: number, lng: number): Promise<ProviderReport> {
    const { QWEATHER_API_HOST: host, QWEATHER_API_KEY: key } = this.env;
    return host && key ? fetchQWeather(host, key, lat, lng) : fetchOpenMeteo(lat, lng);
  }

  private toReport(entry: Entry, location: string, stale: boolean): WeatherReport {
    return { ...entry.report, location, stale, fetchedAt: new Date(entry.fetchedAt).toISOString() };
  }
}

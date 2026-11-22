import { isNative } from './platform';

export type FixQuality = 'fast' | 'precise';

export interface GeoFix {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  timestamp: number;
  quality?: FixQuality;
}

export type LocationErrorCode = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export class LocationError extends Error {
  readonly code: LocationErrorCode;

  constructor(code: LocationErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface GetLocationOptions {
  /** 收到缓存 / Wi-Fi / 基站快速首帧时立即回调，让地图在 0.3s 内先响应 */
  onFastFix?: (fix: GeoFix) => void;
  /** 静默模式：仅在已授予权限时定位，绝不主动弹系统权限窗 */
  silent?: boolean;
}

interface RawCoords {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
}

interface RawPosition {
  coords: RawCoords;
  timestamp: number;
}

let cachedFix: GeoFix | null = null;

/** 两点平面近似距离（米），适用于全球任意短距离定位跳变检测 */
export function approxMetersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const meanLatRad = (((a.lat + b.lat) / 2) * Math.PI) / 180;
  const dy = (b.lat - a.lat) * 111_195;
  const dx = (b.lng - a.lng) * 111_195 * Math.cos(meanLatRad);
  return Math.hypot(dx, dy);
}

/**
 * 定位质量过滤与平滑器：
 * 1. 丢弃明显过期、无效坐标或已锁星时突然回退的粗略基站跳点；
 * 2. 从室内粗略定位切到室外高精度 GNSS 锁星时零延迟瞬时贴合；
 * 3. 原地静止时轻微阻尼 GNSS 漂移（< 3.5m），步行/骑行时保持跟手。
 */
export function acceptAndSmoothFix(prev: GeoFix | null, next: GeoFix): GeoFix | null {
  if (
    !Number.isFinite(next.lat) ||
    !Number.isFinite(next.lng) ||
    (Math.abs(next.lat) < 0.001 && Math.abs(next.lng) < 0.001)
  ) {
    return null;
  }

  const normalizedAccuracy = Math.max(1, Math.round(Number.isFinite(next.accuracy) ? next.accuracy : 25));
  const candidate: GeoFix = {
    ...next,
    accuracy: normalizedAccuracy,
    quality: next.quality ?? (normalizedAccuracy <= 30 ? 'precise' : 'fast'),
  };

  if (!prev) return candidate;

  const dtMs = candidate.timestamp - prev.timestamp;
  // 丢弃乱序的旧缓存回包
  if (dtMs < -2_000) return null;

  // 已获得室外高精度 GNSS 锁星时，拒绝短暂回退到 >100m 的粗略网络/基站定位
  if (prev.accuracy <= 35 && candidate.accuracy > 100 && dtMs < 25_000) {
    return null;
  }
  if (prev.accuracy <= 20 && candidate.accuracy > 65 && dtMs < 12_000) {
    return null;
  }

  const dist = approxMetersBetween(prev, candidate);
  const dtSec = Math.max(0.5, dtMs / 1000);

  // 过滤极端瞬移异常（例如 3 秒内突跳 >250m 且精度更差）
  if (dist > 250 && dtSec < 3 && candidate.accuracy > 40 && candidate.accuracy > prev.accuracy * 1.5) {
    return null;
  }

  const heading =
    candidate.heading !== null ? candidate.heading : dtMs < 8_000 ? prev.heading : null;

  // 从粗略定位升级到高精度锁星：立即瞬移校准，不拖尾
  if (candidate.accuracy <= 25 && prev.accuracy > 45) {
    return { ...candidate, heading };
  }

  // 静止微小 GNSS 抖动（< 3.5m）：轻度指数平滑消除蓝点乱颤
  if (dist < 3.5 && candidate.accuracy >= 8) {
    const alpha = 0.35;
    return {
      ...candidate,
      lat: prev.lat + (candidate.lat - prev.lat) * alpha,
      lng: prev.lng + (candidate.lng - prev.lng) * alpha,
      heading,
    };
  }

  // 步行/移动中但当前点精度一般：轻度平滑兼顾跟手与稳健
  if (dist < 18 && candidate.accuracy > 28) {
    const alpha = 0.72;
    return {
      ...candidate,
      lat: prev.lat + (candidate.lat - prev.lat) * alpha,
      lng: prev.lng + (candidate.lng - prev.lng) * alpha,
      heading,
    };
  }

  return { ...candidate, heading };
}

/** 读取内存中近期有效定位缓存（默认 30 秒内有效），实现 0ms 秒开导航 */
export function getCachedLocation(maxAgeMs = 30_000): GeoFix | null {
  if (!cachedFix) return null;
  if (Date.now() - cachedFix.timestamp > maxAgeMs) return null;
  return cachedFix;
}

function recordFix(fix: GeoFix): GeoFix {
  if (!cachedFix || Date.now() - cachedFix.timestamp > 30_000) {
    cachedFix = fix;
    return fix;
  }
  const merged = acceptAndSmoothFix(cachedFix, fix);
  if (merged) {
    cachedFix = merged;
    return merged;
  }
  return cachedFix;
}

function toGeoFix(pos: RawPosition, quality: FixQuality): GeoFix {
  const accuracy = Math.max(1, Math.round(pos.coords.accuracy ?? 25));
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy,
    heading:
      typeof pos.coords.heading === 'number' && !Number.isNaN(pos.coords.heading) && pos.coords.heading >= 0
        ? pos.coords.heading
        : null,
    timestamp: pos.timestamp || Date.now(),
    quality: quality === 'precise' || accuracy <= 25 ? 'precise' : 'fast',
  };
}

function normalizeError(err: unknown): LocationError {
  if (err instanceof LocationError) return err;
  const msg =
    typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: unknown }).message === 'string'
      ? (err as { message: string }).message
      : '';
  const code =
    typeof err === 'object' && err !== null && 'code' in err && typeof (err as { code: unknown }).code === 'number'
      ? (err as { code: number }).code
      : null;

  if (code === 1 || /denied|permission/i.test(msg)) {
    return new LocationError('denied', '定位权限未开启，请在手机系统设置中允许 GDUT Help 使用位置信息');
  }
  if (code === 3 || /timeout/i.test(msg)) {
    return new LocationError('timeout', '获取 GPS 信号超时，建议到室外开阔处再试一次');
  }
  return new LocationError('unavailable', '当前定位暂不可用，请确认已开启手机位置服务（GPS）');
}

/** 静默检查是否已获得定位权限（绝不弹系统权限框，用于进图页后台预热） */
export async function hasLocationPermission(): Promise<boolean> {
  if (isNative) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const perm = await Geolocation.checkPermissions();
      return perm.location === 'granted' || perm.coarseLocation === 'granted';
    } catch {
      return false;
    }
  }
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return false;
  if ('permissions' in navigator && typeof navigator.permissions.query === 'function') {
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      return status.state === 'granted';
    } catch {
      return false;
    }
  }
  return false;
}

async function ensureNativePermission(reason: string): Promise<void> {
  const { Geolocation } = await import('@capacitor/geolocation');
  const perm = await Geolocation.checkPermissions();
  if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
    const req = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
    if (req.location !== 'granted' && req.coarseLocation !== 'granted') {
      throw new LocationError('denied', reason);
    }
  }
}

async function requestSinglePosition(opts: {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
}): Promise<GeoFix> {
  const quality: FixQuality = opts.enableHighAccuracy ? 'precise' : 'fast';
  if (isNative) {
    const { Geolocation } = await import('@capacitor/geolocation');
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: opts.enableHighAccuracy,
      timeout: opts.timeout,
      maximumAge: opts.maximumAge,
      enableLocationFallback: true,
    });
    return toGeoFix(pos, quality);
  }

  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    throw new LocationError('unsupported', '当前浏览器不支持 GPS 定位');
  }

  return new Promise<GeoFix>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(toGeoFix(pos, quality)),
      (err) => reject(normalizeError(err)),
      {
        enableHighAccuracy: opts.enableHighAccuracy,
        timeout: opts.timeout,
        maximumAge: opts.maximumAge,
      },
    );
  });
}

/**
 * 两阶段极速定位：
 * - Stage 1（< 0.4s）：读取系统缓存 / Wi-Fi / 基站定位立即触发 onFastFix；
 * - Stage 2（并行）：同步拉起高精度 GNSS 锁星并自动回落，绝不在室内死等 12 秒才报错。
 */
export async function getCurrentLocation(options?: GetLocationOptions): Promise<GeoFix> {
  if (options?.silent) {
    const allowed = await hasLocationPermission();
    if (!allowed) {
      throw new LocationError('denied', '定位权限未开启');
    }
  } else if (isNative) {
    try {
      await ensureNativePermission('需要授予位置权限才能在校园地图上显示你的实时位置');
    } catch (err) {
      throw normalizeError(err);
    }
  } else if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    throw new LocationError('unsupported', '当前浏览器不支持 GPS 定位');
  }

  const warm = getCachedLocation(20_000);
  if (warm) {
    options?.onFastFix?.(warm);
    if (warm.accuracy <= 20 && Date.now() - warm.timestamp <= 8_000) {
      return warm;
    }
  }

  return new Promise<GeoFix>((resolve, reject) => {
    let settled = false;
    let fastResult: GeoFix | null = warm;
    let fastDone = false;
    let preciseDone = false;
    let lastErr: unknown = null;

    const finishSuccess = (fix: GeoFix) => {
      if (settled) return;
      settled = true;
      resolve(fix);
    };

    const maybeFinishFailure = () => {
      if (settled || !fastDone || !preciseDone) return;
      if (fastResult) {
        finishSuccess(fastResult);
        return;
      }
      const fallback = getCachedLocation(45_000);
      if (fallback) {
        finishSuccess(fallback);
        return;
      }
      settled = true;
      reject(normalizeError(lastErr));
    };

    // Stage 1: 快速首帧（系统最后位置 / 网络定位，通常 100~400ms 返回）
    void requestSinglePosition({
      enableHighAccuracy: false,
      maximumAge: 60_000,
      timeout: 3_000,
    })
      .then((raw) => {
        fastDone = true;
        const accepted = recordFix(raw);
        fastResult = accepted;
        if (!settled) {
          options?.onFastFix?.(accepted);
          // 若系统已缓存 15 秒内的高精度 GPS 锁星，直接秒返
          if (accepted.accuracy <= 25 && Date.now() - accepted.timestamp <= 15_000) {
            finishSuccess(accepted);
          }
        }
        maybeFinishFailure();
      })
      .catch((err) => {
        fastDone = true;
        lastErr = lastErr ?? err;
        maybeFinishFailure();
      });

    // Stage 2: 并行高精度 GNSS 锁星
    void requestSinglePosition({
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 8_500,
    })
      .then((raw) => {
        preciseDone = true;
        const accepted = recordFix(raw);
        finishSuccess(accepted);
      })
      .catch((err) => {
        preciseDone = true;
        lastErr = err;
        maybeFinishFailure();
      });
  });
}

/**
 * 持续追踪实时位置（高频 1~2s 安卓 GNSS 更新 + 0.3s 快速首帧 + 抖动滤波）。
 * 返回停止追踪的清理函数。
 */
export async function watchLocation(
  onFix: (fix: GeoFix) => void,
  onError?: (err: LocationError) => void,
): Promise<() => void> {
  if (isNative) {
    try {
      await ensureNativePermission('需要授予位置权限才能开启实时导航定位');
    } catch (err) {
      throw normalizeError(err);
    }
  } else if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    throw new LocationError('unsupported', '当前浏览器不支持实时定位');
  }

  let stopped = false;
  let lastEmitted: GeoFix | null = null;

  const emit = (raw: GeoFix) => {
    if (stopped) return;
    const smoothed = acceptAndSmoothFix(lastEmitted, raw);
    if (!smoothed) return;
    lastEmitted = smoothed;
    recordFix(smoothed);
    onFix(smoothed);
  };

  // 立刻回放近期缓存位置（0ms 首帧），避免开启导航后黑屏/傻等
  const warm = getCachedLocation(25_000);
  if (warm) {
    emit(warm);
  }

  // 若无 8 秒内的高精度点，并行触发一次 3s 快速首帧，确保冷启动 <0.4s 出蓝点
  if (!warm || warm.accuracy > 25 || Date.now() - warm.timestamp > 8_000) {
    void requestSinglePosition({
      enableHighAccuracy: false,
      maximumAge: 60_000,
      timeout: 3_000,
    })
      .then((fastFix) => {
        if (!stopped && (!lastEmitted || lastEmitted.accuracy > fastFix.accuracy)) {
          emit(fastFix);
        }
      })
      .catch(() => {
        // 静默忽略快速首帧失败，由主 GNSS watch 兜底
      });
  }

  const handleWatchError = (err: unknown) => {
    if (stopped) return;
    const normalized = normalizeError(err);
    // 过隧道/走廊短暂丢星超时且近期有有效位置时，不刷屏打断导航
    if (normalized.code === 'timeout' && lastEmitted && Date.now() - lastEmitted.timestamp < 30_000) {
      return;
    }
    onError?.(normalized);
  };

  if (isNative) {
    const { Geolocation } = await import('@capacitor/geolocation');
    const id = await Geolocation.watchPosition(
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        interval: 2_000,
        minimumUpdateInterval: 1_000,
        maximumAge: 3_000,
        enableLocationFallback: true,
      },
      (pos, err) => {
        if (err) {
          handleWatchError(err);
          return;
        }
        if (!pos) return;
        emit(toGeoFix(pos, 'precise'));
      },
    );
    return () => {
      stopped = true;
      void Geolocation.clearWatch({ id });
    };
  }

  const watchId = navigator.geolocation.watchPosition(
    (pos) => emit(toGeoFix(pos, 'precise')),
    (err) => handleWatchError(err),
    { enableHighAccuracy: true, timeout: 10_000, maximumAge: 3_000 },
  );

  return () => {
    stopped = true;
    navigator.geolocation.clearWatch(watchId);
  };
}

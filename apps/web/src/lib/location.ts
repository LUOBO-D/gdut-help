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
  course?: number | null;
}

interface RawPosition {
  coords: RawCoords;
  timestamp: number;
}

let cachedFix: GeoFix | null = null;

/** 将任意角度归一化到 [0, 360) */
export function normalizeAngleDeg(deg: number): number {
  const m = deg % 360;
  return m < 0 ? m + 360 : m;
}

/** 计算从 from 到 to 的地理方位角（度：0=正北, 90=正东, 180=正南, 270=正西） */
export function computeBearingDeg(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const meanLatRad = (((from.lat + to.lat) / 2) * Math.PI) / 180;
  const dx = (to.lng - from.lng) * Math.cos(meanLatRad);
  const dy = to.lat - from.lat;
  if (Math.abs(dx) < 1e-10 && Math.abs(dy) < 1e-10) return 0;
  return normalizeAngleDeg((Math.atan2(dx, dy) * 180) / Math.PI);
}

/** 最短弧角度平滑（处理 359° ↔ 1° 跨零无突变） */
export function smoothAngleDeg(prevDeg: number | null, nextDeg: number, alpha = 0.25): number {
  const target = normalizeAngleDeg(nextDeg);
  if (prevDeg === null || !Number.isFinite(prevDeg)) return target;
  const cur = normalizeAngleDeg(prevDeg);
  let delta = ((target - cur + 540) % 360) - 180;
  if (delta < -180) delta += 360;
  return normalizeAngleDeg(cur + delta * alpha);
}

/** 两点平面近似距离（米），适用于全球任意短距离定位跳变检测 */
export function approxMetersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const meanLatRad = (((a.lat + b.lat) / 2) * Math.PI) / 180;
  const dy = (b.lat - a.lat) * 111_195;
  const dx = (b.lng - a.lng) * 111_195 * Math.cos(meanLatRad);
  return Math.hypot(dx, dy);
}

/**
 * 定位质量过滤与平滑器：
 * 1. 兼容国产安卓机 GPS 卫星时钟与系统时钟的轻微偏差（容忍 ≤15s 时差），避免误丢正常定位点；
 * 2. 丢弃已锁星时短时间内回退的粗略基站跳点，但如果超过 12s 没收到高精度点则自动放行避免定死；
 * 3. 行进距离 ≥3.5m 且系统未给朝向时，自动通过位移推算行进方位角，让前进视角持续跟走；
 * 4. 原地静止时轻微阻尼 GNSS 漂移（<3.5m），步行/骑行时保持跟手。
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
    heading:
      next.heading !== null && Number.isFinite(next.heading) && next.heading >= 0
        ? normalizeAngleDeg(next.heading)
        : null,
    quality: next.quality ?? (normalizedAccuracy <= 30 ? 'precise' : 'fast'),
  };

  if (!prev) return candidate;

  const dtMs = candidate.timestamp - prev.timestamp;
  // 容忍国产安卓机 GNSS 与网络定位之间最多 15 秒的时钟微差；仅拒绝明显陈旧缓存
  if (dtMs < -15_000) return null;
  const safeTimestamp = Math.max(prev.timestamp, candidate.timestamp);
  const elapsedMs = Math.max(0, safeTimestamp - prev.timestamp);

  // 已获得室外高精度 GNSS 锁星时，拒绝短时间内回退到粗略基站定位；超过 12s/20s 自动放行防止定位卡死
  if (prev.accuracy <= 35 && candidate.accuracy > 100 && elapsedMs < 20_000) {
    return null;
  }
  if (prev.accuracy <= 20 && candidate.accuracy > 65 && elapsedMs < 10_000) {
    return null;
  }

  const dist = approxMetersBetween(prev, candidate);
  const dtSec = Math.max(0.5, elapsedMs / 1000);

  // 过滤极端瞬移异常（例如 3 秒内突跳 >250m 且精度明显恶化）
  if (dist > 250 && dtSec < 3 && candidate.accuracy > 40 && candidate.accuracy > prev.accuracy * 1.5) {
    return null;
  }

  // 行进中自动推算真实前进方向（比磁力计更抗建筑/金属干扰）
  const movementBearing = dist >= 3.5 && candidate.accuracy <= 45 ? computeBearingDeg(prev, candidate) : null;
  let heading: number | null;
  if (movementBearing !== null) {
    heading = smoothAngleDeg(prev.heading, movementBearing, 0.45);
  } else if (candidate.heading !== null) {
    heading = smoothAngleDeg(prev.heading, candidate.heading, 0.35);
  } else {
    heading = elapsedMs < 12_000 ? prev.heading : null;
  }

  // 从粗略定位升级到高精度锁星：立即瞬移校准，不拖尾
  if (candidate.accuracy <= 25 && prev.accuracy > 45) {
    return { ...candidate, timestamp: safeTimestamp, heading };
  }

  // 静止微小 GNSS 抖动（< 3.5m）：轻度指数平滑消除蓝点乱颤
  if (dist < 3.5 && candidate.accuracy >= 8) {
    const alpha = 0.35;
    return {
      ...candidate,
      timestamp: safeTimestamp,
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
      timestamp: safeTimestamp,
      lat: prev.lat + (candidate.lat - prev.lat) * alpha,
      lng: prev.lng + (candidate.lng - prev.lng) * alpha,
      heading,
    };
  }

  return { ...candidate, timestamp: safeTimestamp, heading };
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

function extractHeading(coords: RawCoords): number | null {
  if (typeof coords.heading === 'number' && Number.isFinite(coords.heading) && coords.heading >= 0) {
    return normalizeAngleDeg(coords.heading);
  }
  if (typeof coords.course === 'number' && Number.isFinite(coords.course) && coords.course >= 0) {
    return normalizeAngleDeg(coords.course);
  }
  return null;
}

function toGeoFix(pos: RawPosition, quality: FixQuality, preferLocalClock = false): GeoFix {
  const accuracy = Math.max(1, Math.round(pos.coords.accuracy ?? 25));
  const now = Date.now();
  // 实时监听回包若卫星时钟与本机时钟存在偏差，用本机单调时间保底，避免误判为旧包或看门狗误触发
  const rawTs = typeof pos.timestamp === 'number' && Number.isFinite(pos.timestamp) && pos.timestamp > 0 ? pos.timestamp : now;
  const timestamp = preferLocalClock && Math.abs(now - rawTs) > 5_000 ? now : rawTs;
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy,
    heading: extractHeading(pos.coords),
    timestamp,
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
  preferLocalClock?: boolean;
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
    return toGeoFix(pos, quality, opts.preferLocalClock);
  }

  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    throw new LocationError('unsupported', '当前浏览器不支持 GPS 定位');
  }

  return new Promise<GeoFix>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(toGeoFix(pos, quality, opts.preferLocalClock)),
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
 * 持续追踪实时位置（自愈断流重连 + 5 秒保活看门狗 + 前后台切回自动续接）。
 *
 * 根因修复：@capacitor/geolocation 在安卓端单次超时会调用 PluginCall.reject() 导致监听流静默终止；
 * 本实现通过「出错自动重建监听 + 定期心跳补采 + 息屏/切后台回来自动重启」确保全程跟走不断流。
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
  let lastSignalAt = Date.now();
  let lastWatchStartedAt = 0;
  let consecutiveErrors = 0;
  let probeInFlight = false;
  let activeCleanup: (() => void) | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let removeAppListener: (() => void) | null = null;

  const emit = (raw: GeoFix) => {
    if (stopped) return;
    lastSignalAt = Date.now();
    consecutiveErrors = 0;
    const smoothed = acceptAndSmoothFix(lastEmitted, raw);
    if (!smoothed) return;
    lastEmitted = smoothed;
    recordFix(smoothed);
    onFix(smoothed);
  };

  const clearActiveWatch = () => {
    const cleanup = activeCleanup;
    activeCleanup = null;
    cleanup?.();
  };

  const runProbe = (highAccuracy: boolean) => {
    if (stopped || probeInFlight) return;
    probeInFlight = true;
    void requestSinglePosition({
      enableHighAccuracy: highAccuracy,
      maximumAge: highAccuracy ? 2_000 : 8_000,
      timeout: highAccuracy ? 4_000 : 2_500,
      preferLocalClock: true,
    })
      .then((fix) => {
        if (!stopped) emit(fix);
      })
      .catch(() => {
        // 心跳补采静默容错，下次周期自动重试
      })
      .finally(() => {
        probeInFlight = false;
      });
  };

  const scheduleRestart = (delayMs: number) => {
    if (stopped || restartTimer) return;
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (!stopped) void startUnderlyingWatch();
    }, delayMs);
  };

  const handleWatchError = (err: unknown) => {
    if (stopped) return;
    const normalized = normalizeError(err);
    if (normalized.code === 'denied') {
      clearActiveWatch();
      onError?.(normalized);
      return;
    }

    // Capacitor Android 端一旦触发 timeout/unavailable 会终止当前 watch 回调：必须主动清理并重连！
    consecutiveErrors += 1;
    clearActiveWatch();
    const backoff = Math.min(4_000, 1_000 * consecutiveErrors);
    scheduleRestart(backoff);
    // 同时发一次快速网络/缓存补采，过隧道或进宿舍楼下不掉线
    runProbe(false);

    // 仅在连续失败且超过 25 秒无任何有效信号时才轻提示用户
    if (consecutiveErrors >= 3 && Date.now() - lastSignalAt > 25_000) {
      onError?.(normalized);
    }
  };

  const startUnderlyingWatch = async () => {
    if (stopped) return;
    clearActiveWatch();
    lastWatchStartedAt = Date.now();

    if (isNative) {
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        if (stopped) return;
        const id = await Geolocation.watchPosition(
          {
            enableHighAccuracy: true,
            timeout: 30_000,
            interval: 1_500,
            minimumUpdateInterval: 800,
            maximumAge: 2_000,
            enableLocationFallback: true,
          },
          (pos, err) => {
            if (err) {
              handleWatchError(err);
              return;
            }
            if (!pos) return;
            emit(toGeoFix(pos, 'precise', true));
          },
        );
        if (stopped) {
          void Geolocation.clearWatch({ id });
          return;
        }
        activeCleanup = () => {
          void Geolocation.clearWatch({ id }).catch(() => {});
        };
      } catch (err) {
        handleWatchError(err);
      }
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => emit(toGeoFix(pos, 'precise', true)),
      (err) => handleWatchError(err),
      { enableHighAccuracy: true, timeout: 25_000, maximumAge: 2_000 },
    );
    activeCleanup = () => {
      navigator.geolocation.clearWatch(watchId);
    };
  };

  // 立刻回放近期缓存位置（0ms 首帧），避免开启导航后黑屏/傻等
  const warm = getCachedLocation(25_000);
  if (warm) {
    emit(warm);
  }

  // 启动底层实时监听 + 冷启动 0.3s 快速首帧
  await startUnderlyingWatch();
  if (!warm || warm.accuracy > 25 || Date.now() - warm.timestamp > 8_000) {
    runProbe(false);
  }

  // 保活看门狗：每 4 秒检查监听流是否静默卡死（安卓省电策略 / 过隧道后常见），自动补采与重建监听
  const watchdog = setInterval(() => {
    if (stopped) return;
    const silentMs = Date.now() - lastSignalAt;
    if (silentMs >= 12_000 && Date.now() - lastWatchStartedAt >= 12_000) {
      void startUnderlyingWatch();
      runProbe(false);
    } else if (silentMs >= 5_500) {
      runProbe(true);
    }
  }, 4_000);

  // 切后台 / 锁屏后回到 App 时立即续接定位流
  const handleResume = () => {
    if (stopped) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    void startUnderlyingWatch();
    runProbe(true);
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleResume);
  }

  if (isNative) {
    void import('@capacitor/app')
      .then(({ App }) =>
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) handleResume();
        }),
      )
      .then((handle) => {
        if (stopped) {
          void handle.remove();
        } else {
          removeAppListener = () => {
            void handle.remove();
          };
        }
      })
      .catch(() => {});
  }

  return () => {
    stopped = true;
    clearInterval(watchdog);
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleResume);
    }
    removeAppListener?.();
    removeAppListener = null;
    clearActiveWatch();
  };
}

/**
 * 监听手机电子罗盘朝向（0°=正北, 90°=正东, 180°=正南, 270°=正西），
 * 用于导航刚启动或原地转身时即时旋转地图至前进方向。
 */
export function watchCompassHeading(onHeading: (deg: number) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  let smoothed: number | null = null;
  let lastReported = -999;
  let lastReportAt = 0;
  let hasAbsoluteEvent = false;

  const getScreenAngle = (): number => {
    if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.angle === 'number') {
      return screen.orientation.angle;
    }
    return 0;
  };

  const handleOrientation = (ev: Event, isAbsoluteSource: boolean) => {
    const e = ev as DeviceOrientationEvent & { webkitCompassHeading?: number };
    if (isAbsoluteSource) hasAbsoluteEvent = true;
    else if (hasAbsoluteEvent) return;

    let rawHeading: number | null = null;
    if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) {
      rawHeading = normalizeAngleDeg(e.webkitCompassHeading);
    } else if (typeof e.alpha === 'number' && Number.isFinite(e.alpha)) {
      // 仅使用绝对方位角或明确声明 absolute=true 的事件，避免无北向基准的相对陀螺仪乱转
      if (!isAbsoluteSource && e.absolute !== true) return;
      rawHeading = normalizeAngleDeg(360 - e.alpha + getScreenAngle());
    }

    if (rawHeading === null) return;
    smoothed = smoothAngleDeg(smoothed, rawHeading, 0.22);

    const now = Date.now();
    const diff = Math.abs(((smoothed - lastReported + 540) % 360) - 180);
    if (now - lastReportAt >= 70 && (lastReported < 0 || diff >= 1.5)) {
      lastReportAt = now;
      lastReported = smoothed;
      onHeading(smoothed);
    }
  };

  const onAbs = (e: Event) => handleOrientation(e, true);
  const onStd = (e: Event) => handleOrientation(e, false);

  window.addEventListener('deviceorientationabsolute', onAbs, true);
  window.addEventListener('deviceorientation', onStd, true);

  return () => {
    window.removeEventListener('deviceorientationabsolute', onAbs, true);
    window.removeEventListener('deviceorientation', onStd, true);
  };
}

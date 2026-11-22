import { isNative } from './platform';

export interface GeoFix {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  timestamp: number;
}

export type LocationErrorCode = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export class LocationError extends Error {
  readonly code: LocationErrorCode;

  constructor(code: LocationErrorCode, message: string) {
    super(message);
    this.code = code;
  }
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

/** 请求一次高精度 GPS 定位（原生安卓走 @capacitor/geolocation，网页走浏览器的 geolocation） */
export async function getCurrentLocation(): Promise<GeoFix> {
  if (isNative) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
        const req = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
        if (req.location !== 'granted' && req.coarseLocation !== 'granted') {
          throw new LocationError('denied', '需要授予位置权限才能在校园地图上显示你的实时位置');
        }
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 5_000,
      });
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy ?? 20),
        heading: typeof pos.coords.heading === 'number' && !Number.isNaN(pos.coords.heading) ? pos.coords.heading : null,
        timestamp: pos.timestamp,
      };
    } catch (err) {
      throw normalizeError(err);
    }
  }

  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    throw new LocationError('unsupported', '当前浏览器不支持 GPS 定位');
  }

  return new Promise<GeoFix>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 20),
          heading: typeof pos.coords.heading === 'number' && !Number.isNaN(pos.coords.heading) ? pos.coords.heading : null,
          timestamp: pos.timestamp,
        }),
      (err) => reject(normalizeError(err)),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 5_000 },
    );
  });
}

/**
 * 持续追踪实时位置（用于校园导航蓝点跟走与偏航检测）。
 * 返回停止追踪的清理函数。
 */
export async function watchLocation(
  onFix: (fix: GeoFix) => void,
  onError?: (err: LocationError) => void,
): Promise<() => void> {
  if (isNative) {
    const { Geolocation } = await import('@capacitor/geolocation');
    const perm = await Geolocation.checkPermissions();
    if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
      const req = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
      if (req.location !== 'granted' && req.coarseLocation !== 'granted') {
        throw new LocationError('denied', '需要授予位置权限才能开启实时导航定位');
      }
    }
    const id = await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 3_000 },
      (pos, err) => {
        if (err) {
          onError?.(normalizeError(err));
          return;
        }
        if (!pos) return;
        onFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy ?? 20),
          heading: typeof pos.coords.heading === 'number' && !Number.isNaN(pos.coords.heading) ? pos.coords.heading : null,
          timestamp: pos.timestamp,
        });
      },
    );
    return () => {
      void Geolocation.clearWatch({ id });
    };
  }

  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    throw new LocationError('unsupported', '当前浏览器不支持实时定位');
  }

  const watchId = navigator.geolocation.watchPosition(
    (pos) =>
      onFix({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy || 20),
        heading: typeof pos.coords.heading === 'number' && !Number.isNaN(pos.coords.heading) ? pos.coords.heading : null,
        timestamp: pos.timestamp,
      }),
    (err) => onError?.(normalizeError(err)),
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 3_000 },
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
}

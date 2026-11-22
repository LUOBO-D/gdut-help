import type { WeatherScene } from '@gduthelp/shared';

/** 和风天气现象代码 → 场景。代码表：https://dev.qweather.com/docs/resource/icons/ */
export function qweatherScene(code: string, isNight: boolean): WeatherScene {
  const c = Number(code);
  if (c >= 302 && c <= 304) return 'thunder';
  if (c >= 300 && c < 400) return 'rain';
  if (c >= 400 && c < 500) return 'snow';
  if (c >= 500 && c < 600) return 'fog';
  if (c === 104) return 'cloudy';
  // 100 晴、101–103 多云/少云/晴间多云、150–153 对应夜间
  if (c === 100 || c === 150) return isNight ? 'night' : 'sunny';
  if (c >= 101 && c <= 153) return isNight ? 'night' : 'cloudy';
  return isNight ? 'night' : 'cloudy';
}

/** Open-Meteo 使用 WMO 天气代码 */
export function wmoScene(code: number, isNight: boolean): WeatherScene {
  if (code >= 95) return 'thunder';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 51 && code <= 82) return 'rain';
  if (code === 45 || code === 48) return 'fog';
  if (code === 3) return 'cloudy';
  if (code <= 2) return isNight ? 'night' : code === 0 || code === 1 ? 'sunny' : 'cloudy';
  return 'cloudy';
}

const WMO_TEXT: Record<number, string> = {
  0: '晴', 1: '晴', 2: '多云', 3: '阴', 45: '雾', 48: '雾凇',
  51: '毛毛雨', 53: '毛毛雨', 55: '毛毛雨', 56: '冻毛毛雨', 57: '冻毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '阵雨', 81: '阵雨', 82: '强阵雨', 85: '阵雪', 86: '强阵雪',
  95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '雷阵雨伴冰雹',
};

export const wmoText = (code: number) => WMO_TEXT[code] ?? '未知';

/** MET Norway symbol_code → 场景 */
export function metNoScene(symbol: string, isNight: boolean): WeatherScene {
  const s = symbol.toLowerCase();
  if (s.includes('thunder')) return 'thunder';
  if (s.includes('snow') || s.includes('sleet')) return 'snow';
  if (s.includes('rain')) return 'rain';
  if (s.includes('fog')) return 'fog';
  if (s.startsWith('cloudy')) return 'cloudy';
  if (s.includes('_night') || isNight) return 'night';
  if (s.startsWith('clearsky') || s.startsWith('fair')) return 'sunny';
  return 'cloudy';
}

export function metNoText(symbol: string): string {
  const s = symbol.toLowerCase();
  if (s.includes('thunder')) return '雷阵雨';
  if (s.includes('heavysnow')) return '大雪';
  if (s.includes('snow')) return '小雪';
  if (s.includes('sleet')) return '雨夹雪';
  if (s.includes('heavyrain')) return '大雨';
  if (s.includes('lightrain')) return '小雨';
  if (s.includes('rainshowers')) return '阵雨';
  if (s.includes('rain')) return '中雨';
  if (s.includes('fog')) return '雾';
  if (s.startsWith('cloudy')) return '阴';
  if (s.startsWith('partlycloudy')) return '多云';
  if (s.startsWith('fair') || s.startsWith('clearsky')) return '晴';
  return '多云';
}

/** 是否处于日落到日出之间。没有日出日落数据时按 6–18 点粗略判断 */
export function isNightAt(at: Date, sunrise: string | null, sunset: string | null): boolean {
  if (sunrise && sunset) {
    const t = at.getTime();
    const rise = new Date(sunrise).getTime();
    const set = new Date(sunset).getTime();
    // 日出日落是「今天」的；时间点可能在明天凌晨，按一天的周期比较
    const dayMs = 24 * 3600_000;
    const tod = (x: number) => ((x % dayMs) + dayMs) % dayMs;
    const [r, s, x] = [tod(rise), tod(set), tod(t)];
    return r < s ? x < r || x >= s : x >= s && x < r;
  }
  const h = (at.getUTCHours() + 8) % 24;
  return h < 6 || h >= 18;
}

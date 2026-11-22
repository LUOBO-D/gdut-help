/** 天气场景，前端据此切换主题与 3D 天空 */
export const SCENES = ['sunny', 'cloudy', 'rain', 'thunder', 'snow', 'fog', 'night'] as const;
export type WeatherScene = (typeof SCENES)[number];

export interface WeatherNow {
  temp: number;
  feelsLike: number;
  text: string;
  scene: WeatherScene;
  /** 相对湿度 0–100 */
  humidity: number | null;
}

export interface WeatherHour {
  /** ISO 时间（整点） */
  time: string;
  temp: number;
  text: string;
  scene: WeatherScene;
  /** 降水概率 0–100，数据源不提供时为 null */
  pop: number | null;
}

export interface WeatherToday {
  min: number;
  max: number;
  pop: number | null;
  sunrise: string | null;
  sunset: string | null;
}

export interface WeatherReport {
  source: 'qweather' | 'open-meteo' | 'met-no';
  /** 地点名称，如「广州·番禺」 */
  location: string;
  /** 数据获取时间 */
  fetchedAt: string;
  now: WeatherNow;
  today: WeatherToday;
  /** 从当前小时起 24 小时 */
  hourly: WeatherHour[];
  /** 数据源暂时不可用，返回的是上一次的缓存 */
  stale: boolean;
  /** 数据源要求显示的署名 */
  attribution: string;
}

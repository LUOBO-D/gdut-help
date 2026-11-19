import type { WeatherHour, WeatherReport } from '@gduthelp/shared';
import { isNightAt, qweatherScene, wmoScene, wmoText } from './scene.js';

export type ProviderReport = Omit<WeatherReport, 'location' | 'stale' | 'fetchedAt'>;

const TIMEOUT_MS = 8000;

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`天气接口返回 ${res.status}：${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

const round = (v: number) => Math.round(v);
const pct = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v * 100));

// ---------- 和风天气（新版 /weather/v1 接口，经纬度查询） ----------

interface QValue {
  value: number;
}
interface QCondition {
  text: string;
  code: string;
}
interface QCurrent {
  condition: QCondition;
  temperature: QValue;
  feelsLike: QValue;
  humidity: number;
}
interface QHour {
  forecastTime: string;
  condition: QCondition;
  temperature: QValue;
  precipitation?: { probability?: number };
}
interface QDay {
  astro?: { sunrise?: string; sunset?: string };
  temperatureMax: QValue;
  temperatureMin: QValue;
  daytime?: { precipitation?: { probability?: number } };
  nighttime?: { precipitation?: { probability?: number } };
}

export async function fetchQWeather(host: string, key: string, lat: number, lng: number): Promise<ProviderReport> {
  const base = `https://${host.replace(/^https?:\/\//, '').replace(/\/$/, '')}/weather/v1`;
  const loc = `${lat.toFixed(2)}/${lng.toFixed(2)}`;
  const headers = { 'X-QW-Api-Key': key };
  const [current, hourly, daily] = await Promise.all([
    getJson<QCurrent>(`${base}/current/${loc}?lang=zh`, headers),
    getJson<{ hours: QHour[] }>(`${base}/hourly/${loc}?hours=24&lang=zh`, headers),
    getJson<{ days: QDay[] }>(`${base}/daily/${loc}?days=1&lang=zh`, headers),
  ]);
  const day = daily.days[0];
  const sunrise = day?.astro?.sunrise ?? null;
  const sunset = day?.astro?.sunset ?? null;
  const now = new Date();
  const pops = [day?.daytime?.precipitation?.probability, day?.nighttime?.precipitation?.probability].filter(
    (p): p is number => typeof p === 'number',
  );

  return {
    source: 'qweather',
    attribution: '天气数据：和风天气',
    now: {
      temp: round(current.temperature.value),
      feelsLike: round(current.feelsLike.value),
      text: current.condition.text,
      scene: qweatherScene(current.condition.code, isNightAt(now, sunrise, sunset)),
      humidity: pct(current.humidity),
    },
    today: {
      min: round(day?.temperatureMin.value ?? current.temperature.value),
      max: round(day?.temperatureMax.value ?? current.temperature.value),
      pop: pops.length ? pct(Math.max(...pops)) : null,
      sunrise,
      sunset,
    },
    hourly: hourly.hours.slice(0, 24).map(
      (h): WeatherHour => ({
        time: new Date(h.forecastTime).toISOString(),
        temp: round(h.temperature.value),
        text: h.condition.text,
        scene: qweatherScene(h.condition.code, isNightAt(new Date(h.forecastTime), sunrise, sunset)),
        pop: pct(h.precipitation?.probability),
      }),
    ),
  };
}

// ---------- Open-Meteo（免注册，作为未配置和风天气时的数据源） ----------

interface OpenMeteo {
  current: { time: string; temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; weather_code: number };
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; precipitation_probability: (number | null)[] };
  daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[]; sunrise: string[]; sunset: string[] };
}

export async function fetchOpenMeteo(lat: number, lng: number): Promise<ProviderReport> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code',
    hourly: 'temperature_2m,weather_code,precipitation_probability',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    // 返回 UTC 时间，统一用 ISO 处理，避免时区混淆
    timezone: 'GMT',
    forecast_days: '2',
  });
  const d = await getJson<OpenMeteo>(`https://api.open-meteo.com/v1/forecast?${params}`);
  const iso = (t: string) => new Date(`${t}Z`).toISOString();
  // GMT 下「今天」的日出日落：取第一个日出之后的日落
  const sunrise = d.daily.sunrise[0] ? iso(d.daily.sunrise[0]) : null;
  const sunset = d.daily.sunset.map(iso).find((s) => !sunrise || s > sunrise) ?? null;
  const now = new Date();
  const currentHour = new Date(now);
  currentHour.setUTCMinutes(0, 0, 0);
  const start = d.hourly.time.findIndex((t) => iso(t) >= currentHour.toISOString());

  return {
    source: 'open-meteo',
    attribution: '天气数据：Open-Meteo.com（CC BY 4.0）',
    now: {
      temp: round(d.current.temperature_2m),
      feelsLike: round(d.current.apparent_temperature),
      text: wmoText(d.current.weather_code),
      scene: wmoScene(d.current.weather_code, isNightAt(now, sunrise, sunset)),
      humidity: round(d.current.relative_humidity_2m),
    },
    today: {
      min: round(d.daily.temperature_2m_min[0] ?? d.current.temperature_2m),
      max: round(d.daily.temperature_2m_max[0] ?? d.current.temperature_2m),
      pop: d.daily.precipitation_probability_max[0] ?? null,
      sunrise,
      sunset,
    },
    hourly: d.hourly.time.slice(Math.max(0, start), Math.max(0, start) + 24).map((t, i): WeatherHour => {
      const j = Math.max(0, start) + i;
      const code = d.hourly.weather_code[j]!;
      return {
        time: iso(t),
        temp: round(d.hourly.temperature_2m[j]!),
        text: wmoText(code),
        scene: wmoScene(code, isNightAt(new Date(iso(t)), sunrise, sunset)),
        pop: d.hourly.precipitation_probability[j] ?? null,
      };
    }),
  };
}

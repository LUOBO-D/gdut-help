import type { WeatherHour, WeatherReport } from '@gduthelp/shared';
import { isNightAt, metNoScene, metNoText, qweatherScene, wmoScene, wmoText } from './scene.js';

export type ProviderReport = Omit<WeatherReport, 'location' | 'stale' | 'fetchedAt'>;

const TIMEOUT_MS = 5000;

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

// ---------- MET Norway（免注册，Fastly 全球 CDN，作为 Open-Meteo 偶发超时时的自动备用源） ----------

interface MetNoEntry {
  time: string;
  data: {
    instant: { details: { air_temperature: number; relative_humidity?: number } };
    next_1_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } };
    next_6_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } };
  };
}

interface MetNoResponse {
  properties: { timeseries: MetNoEntry[] };
}

export async function fetchMetNo(lat: number, lng: number): Promise<ProviderReport> {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}`;
  const d = await getJson<MetNoResponse>(url, {
    'User-Agent': 'GDUTHelp/0.2 (https://github.com/LUOBO-D/gdut-help)',
  });
  const list = d.properties.timeseries;
  if (!list.length) throw new Error('MET Norway 返回空数据');

  const now = new Date();
  const current = list[0]!;
  const currentSymbol = current.data.next_1_hours?.summary?.symbol_code ?? current.data.next_6_hours?.summary?.symbol_code ?? 'partlycloudy_day';
  const slice24 = list.slice(0, 24);
  const temps = slice24.map((e) => e.data.instant.details.air_temperature);
  const maxPrecip = Math.max(
    0,
    ...slice24.map((e) => e.data.next_1_hours?.details?.precipitation_amount ?? e.data.next_6_hours?.details?.precipitation_amount ?? 0),
  );
  // MET compact 不直接提供百分比降水概率，仅在有明确降水量时估算提示（>=0.5mm 视为较高降水概率）
  const estimatePop = (mm: number | undefined) => (mm === undefined ? null : mm >= 1 ? 80 : mm >= 0.2 ? 55 : mm > 0 ? 30 : 0);

  return {
    source: 'met-no',
    attribution: '天气数据：MET Norway（CC BY 4.0）',
    now: {
      temp: round(current.data.instant.details.air_temperature),
      feelsLike: round(current.data.instant.details.air_temperature),
      text: metNoText(currentSymbol),
      scene: metNoScene(currentSymbol, isNightAt(now, null, null)),
      humidity: current.data.instant.details.relative_humidity != null ? round(current.data.instant.details.relative_humidity) : null,
    },
    today: {
      min: round(Math.min(...temps)),
      max: round(Math.max(...temps)),
      pop: estimatePop(maxPrecip),
      sunrise: null,
      sunset: null,
    },
    hourly: slice24.map((e): WeatherHour => {
      const sym = e.data.next_1_hours?.summary?.symbol_code ?? e.data.next_6_hours?.summary?.symbol_code ?? currentSymbol;
      const t = new Date(e.time);
      return {
        time: t.toISOString(),
        temp: round(e.data.instant.details.air_temperature),
        text: metNoText(sym),
        scene: metNoScene(sym, isNightAt(t, null, null)),
        pop: estimatePop(e.data.next_1_hours?.details?.precipitation_amount),
      };
    }),
  };
}

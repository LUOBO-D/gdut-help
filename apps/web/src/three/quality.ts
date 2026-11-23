import type { ModelEntry } from 'detect-gpu';

/** 画质档位，见 docs/04-frontend.md 第 5 节。low 不渲染 3D，玻璃不做模糊。 */
export type Quality = 'high' | 'medium' | 'low';
export type QualityPreference = 'auto' | Quality;

export const QUALITY_LABEL: Record<Quality, string> = { high: '高', medium: '中', low: '低' };

const ORDER: Quality[] = ['low', 'medium', 'high'];
export const lowerQuality = (q: Quality): Quality => ORDER[Math.max(0, ORDER.indexOf(q) - 1)]!;
export const minQuality = (a: Quality, b: Quality): Quality => (ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b);

export interface Sky3DSettings {
  /** 设备像素比上限 */
  dpr: number;
  rain: number;
  snow: number;
  stars: number;
  /** 云团数量上限 */
  clouds: number;
}

export const SKY3D_SETTINGS: Record<Exclude<Quality, 'low'>, Sky3DSettings> = {
  high: { dpr: 1.5, rain: 1600, snow: 1000, stars: 1000, clouds: 8 },
  medium: { dpr: 1, rain: 500, snow: 350, stars: 450, clouds: 5 },
};

/** 连续 3 秒平均帧率低于这个值时自动降一档（避开切页瞬间掉帧误触发） */
export const MIN_FPS = 26;

/**
 * detect-gpu 默认从 unpkg 下载跑分数据，国内访问不稳定。
 * 这里把数据随应用打包，每个 GPU 厂商一个按需加载的小文件。
 */
const benchmarks = import.meta.glob<ModelEntry[]>('/node_modules/detect-gpu/dist/benchmarks/*.json', {
  import: 'default',
});

async function loadBenchmarks(file: string): Promise<ModelEntry[]> {
  const load = benchmarks[`/node_modules/detect-gpu/dist/benchmarks/${file}`];
  if (!load) throw new Error(`缺少 GPU 跑分数据：${file}`);
  return load();
}

interface NavigatorHints {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

export async function detectQuality(): Promise<{ quality: Quality; gpu: string }> {
  const nav = navigator as Navigator & NavigatorHints;
  if (nav.connection?.saveData) return { quality: 'low', gpu: '省流量模式' };
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) return { quality: 'low', gpu: `内存 ${nav.deviceMemory}GB` };

  try {
    const { getGPUTier } = await import('detect-gpu');
    const result = await getGPUTier({ override: { loadBenchmarks } });
    const gpu = result.gpu ?? '未知 GPU';
    // 跑分库里没有的 GPU 给中档，靠运行时帧率监测兜底
    if (result.type === 'FALLBACK') return { quality: 'medium', gpu };
    const quality: Quality = result.tier >= 3 ? 'high' : result.tier === 2 ? 'medium' : 'low';
    return { quality, gpu };
  } catch {
    return { quality: 'medium', gpu: '检测失败' };
  }
}

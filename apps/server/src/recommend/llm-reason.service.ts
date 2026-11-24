import { Inject, Injectable, Logger } from '@nestjs/common';
import { MEAL_LABELS, MOOD_META, type MealRecommendation, type MealType, type MoodType } from '@gduthelp/shared';
import { z } from 'zod';
import { ENV, type Env } from '../config/env.js';

const TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE = 200;
/** 单用户每日最多触发 12 次付费 LLM 润色，超额无缝降级为本地零成本规则引擎 */
const MAX_USER_CALLS_PER_DAY = 12;
/** 全站每分钟 LLM 调用硬熔断上限，防止分布式账号集群刷空 DeepSeek 余额 */
const MAX_GLOBAL_CALLS_PER_MINUTE = 30;
const MAX_USER_BUDGET_ENTRIES = 2000;

const responseSchema = z.object({
  reasons: z.record(z.string(), z.string().trim().min(2).max(40)),
});

interface CacheEntry {
  reasons: Record<string, string>;
  at: number;
}

/**
 * 可选大模型推荐语润色（DeepSeek / OpenAI 兼容接口，docs/03-backend.md 4.3）：
 * - 未配置 LLM_API_KEY 时零外部调用，直接沿用规则模板理由
 * - 3 秒超时与严格 JSON 校验，失败或超时自动回退规则理由，绝不拖慢或打断推荐接口
 * - 按（用户 + 日期 + 餐次 + 心情 + 候选组合）缓存 6 小时，避免重复消耗 token
 */
@Injectable()
export class LlmReasonService {
  private readonly logger = new Logger(LlmReasonService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly userDailyCalls = new Map<string, number>();
  private globalWindowStart = 0;
  private globalWindowCount = 0;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async polish(opts: {
    userId: string;
    date: string;
    meal: MealType;
    mood: MoodType | null;
    weatherSummary: string | null;
    scheduleHint: string | null;
    items: MealRecommendation[];
  }): Promise<MealRecommendation[]> {
    const { items } = opts;
    if (!this.env.LLM_API_KEY || items.length === 0) return items;

    const ids = items.map((i) => i.merchant.id).join(',');
    const cacheKey = `${opts.userId}|${opts.date}|${opts.meal}|${opts.mood ?? ''}|${opts.scheduleHint ?? ''}|${ids}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return this.applyReasons(items, cached.reasons);
    }

    if (!this.consumeBudget(opts.userId, opts.date)) {
      return items;
    }

    try {
      const reasons = await this.requestReasons(opts);
      this.store(cacheKey, reasons);
      return this.applyReasons(items, reasons);
    } catch (err) {
      this.logger.warn(`大模型推荐语生成失败，已回退规则理由：${err instanceof Error ? err.message : String(err)}`);
      return items;
    }
  }

  private consumeBudget(userId: string, date: string, now = Date.now()): boolean {
    if (now - this.globalWindowStart >= 60_000) {
      this.globalWindowStart = now;
      this.globalWindowCount = 0;
    }
    if (this.globalWindowCount >= MAX_GLOBAL_CALLS_PER_MINUTE) {
      this.logger.warn('LLM 全站每分钟调用达到熔断阈值，已自动降级为规则推荐语');
      return false;
    }

    const userKey = `${userId}|${date}`;
    const count = this.userDailyCalls.get(userKey) ?? 0;
    if (count >= MAX_USER_CALLS_PER_DAY) return false;

    if (this.userDailyCalls.size >= MAX_USER_BUDGET_ENTRIES && !this.userDailyCalls.has(userKey)) {
      const oldest = this.userDailyCalls.keys().next().value;
      if (oldest !== undefined) this.userDailyCalls.delete(oldest);
    }
    this.userDailyCalls.set(userKey, count + 1);
    this.globalWindowCount += 1;
    return true;
  }

  private applyReasons(items: MealRecommendation[], reasons: Record<string, string>): MealRecommendation[] {
    return items.map((item) => {
      const text = reasons[item.merchant.id];
      return text ? { ...item, reason: text } : item;
    });
  }

  private store(key: string, reasons: Record<string, string>) {
    this.cache.delete(key);
    this.cache.set(key, { reasons, at: Date.now() });
    while (this.cache.size > MAX_CACHE) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private async requestReasons(opts: {
    meal: MealType;
    mood: MoodType | null;
    weatherSummary: string | null;
    scheduleHint: string | null;
    items: MealRecommendation[];
  }): Promise<Record<string, string>> {
    const base = this.env.LLM_API_BASE.replace(/\/$/, '');
    const candidates = opts.items.map((i) => ({
      id: i.merchant.id,
      name: i.merchant.name,
      location: i.merchant.locationText,
      walkMinutes: i.merchant.walkMinutes,
      priceAvg: i.merchant.priceAvg,
      tags: i.merchant.tags.slice(0, 4),
      dish: i.merchant.dishes[0]?.name ?? null,
    }));

    const userPrompt = JSON.stringify({
      meal: MEAL_LABELS[opts.meal],
      weather: opts.weatherSummary ?? '未知',
      schedule: opts.scheduleHint ?? '无特殊限制',
      mood: opts.mood ? MOOD_META[opts.mood].label : '未填写',
      candidates,
    });

    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: this.env.LLM_MODEL,
        temperature: 0.6,
        max_tokens: 240,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              '你是广东工业大学校园生活助手。根据学生的天气、课表与待办安排、心情和候选商家，为每个候选写一句自然、贴心、不夸张的中文推荐理由（每句不超过 28 字）。严格输出 JSON：{"reasons":{"商家id":"一句话理由"}}。',
          },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) throw new Error('empty content');
    const parsed = responseSchema.parse(JSON.parse(raw));
    return parsed.reasons;
  }
}

import type { MealRecommendation } from '@gduthelp/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import { LlmReasonService } from './llm-reason.service.js';

const sampleItem: MealRecommendation = {
  merchant: {
    id: 'm1',
    name: '老广煲仔饭',
    category: 'canteen',
    campusId: 'hemc',
    locationText: '二饭三楼',
    walkMinutes: 5,
    priceAvg: 16,
    tags: ['饭', '热食'],
    openHours: null,
    submittedBy: 'u1',
    confirmCount: 0,
    status: 'approved',
    ratingAvg: 4.5,
    ratingCount: 3,
    bayesScore: 4.1,
    dishes: [],
    createdAt: '2026-11-21T00:00:00.000Z',
    updatedAt: '2026-11-21T00:00:00.000Z',
  },
  score: 0.82,
  breakdown: { weather: 0.8, distance: 0.8, mood: 0.8, preference: 0.8, community: 0.8, repeatPenalty: 0, total: 0.82 },
  reason: '规则模板理由',
  matchedTags: ['热食'],
};

describe('LlmReasonService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('未配置 LLM_API_KEY 时直接返回规则理由且不发起网络请求', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const service = new LlmReasonService({
      LLM_API_BASE: 'https://api.deepseek.com/v1',
      LLM_API_KEY: '',
      LLM_MODEL: 'deepseek-chat',
    } as Env);

    const res = await service.polish({
      userId: 'u1',
      date: '2026-11-21',
      meal: 'lunch',
      mood: 'tired',
      weatherSummary: '16° 小雨',
      scheduleHint: null,
      items: [sampleItem],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res[0]!.reason).toBe('规则模板理由');
  });

  it('成功调用时替换推荐语并命中缓存，上游异常时优雅回退规则理由', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ reasons: { m1: '下雨微凉，二饭煲仔饭热乎暖胃' } }) } }],
        }),
        { status: 200 },
      ),
    );
    const service = new LlmReasonService({
      LLM_API_BASE: 'https://api.deepseek.com/v1',
      LLM_API_KEY: 'sk-test',
      LLM_MODEL: 'deepseek-chat',
    } as Env);

    const input = {
      userId: 'u1',
      date: '2026-11-21',
      meal: 'lunch' as const,
      mood: 'tired' as const,
      weatherSummary: '16° 小雨',
      scheduleHint: null,
      items: [sampleItem],
    };

    const r1 = await service.polish(input);
    const r2 = await service.polish(input);
    expect(r1[0]!.reason).toBe('下雨微凉，二饭煲仔饭热乎暖胃');
    expect(r2[0]!.reason).toBe('下雨微凉，二饭煲仔饭热乎暖胃');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // 换一餐上游失败时回退规则理由
    fetchSpy.mockRejectedValueOnce(new Error('timeout'));
    const r3 = await service.polish({ ...input, meal: 'dinner' });
    expect(r3[0]!.reason).toBe('规则模板理由');
  });
});

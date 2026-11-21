import { describe, expect, it } from 'vitest';
import { computeBayesScore, computeWeeklyHeat, reviewInputSchema } from './review.js';

describe('贝叶斯排名与本周热度', () => {
  it('1 条 5 星评价不会高于 20 条 4.6 星评价', () => {
    const oneFive = computeBayesScore(5, 1, 4.0, 10); // (40 + 5) / 11 ≈ 4.091
    const twentyGood = computeBayesScore(92, 20, 4.0, 10); // (40 + 92) / 30 = 4.4
    expect(twentyGood).toBeGreaterThan(oneFive);
    expect(oneFive).toBeCloseTo(4.091, 2);
  });

  it('无评价时贝叶斯分为 0', () => {
    expect(computeBayesScore(0, 0, 4.0)).toBe(0);
  });

  it('按设计公式计算本周热度', () => {
    expect(computeWeeklyHeat({ reviews: 2, likes: 5, accepted: 3 })).toBe(2 * 3 + 5 + 3 * 2);
  });

  it('校验评价输入范围', () => {
    expect(
      reviewInputSchema.safeParse({
        scoreOverall: 5,
        scoreTaste: 5,
        scoreValue: 4,
        scoreEnv: 4,
        scoreSpeed: 5,
        content: '煲仔饭锅巴很香',
      }).success,
    ).toBe(true);
    expect(
      reviewInputSchema.safeParse({
        scoreOverall: 6,
        scoreTaste: 5,
        scoreValue: 4,
        scoreEnv: 4,
        scoreSpeed: 5,
      }).success,
    ).toBe(false);
  });
});

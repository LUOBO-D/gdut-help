import { describe, expect, it } from 'vitest';
import {
  analyzeMealWindow,
  defaultMealForHour,
  findSimilarMerchants,
  nameSimilarity,
  scoreAndRecommendMeals,
  type Merchant,
} from './food.js';
import type { ClassSession } from './timetable.js';

function makeMerchant(overrides: Partial<Merchant> & { id: string; name: string }): Merchant {
  return {
    category: 'canteen',
    campusId: 'hemc',
    locationText: '二饭三楼',
    walkMinutes: 6,
    priceAvg: 16,
    tags: ['饭', '热食'],
    openHours: null,
    submittedBy: '00000000-0000-0000-0000-000000000001',
    confirmCount: 0,
    status: 'approved',
    ratingAvg: 0,
    ratingCount: 0,
    bayesScore: 0,
    dishes: [],
    createdAt: '2026-11-20T00:00:00.000Z',
    updatedAt: '2026-11-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('商家查重逻辑', () => {
  it('完全相同或仅符号空格不同时相似度为 1', () => {
    expect(nameSimilarity('老广煲仔饭', '老广煲仔饭')).toBe(1);
    expect(nameSimilarity('二饭 · 煲仔饭', '二饭煲仔饭')).toBe(1);
  });

  it('包含关系与相近名称能被同校区查重命中，跨校区和已拒绝会被排除', () => {
    const candidates = [
      makeMerchant({ id: '1', name: '二饭三楼老广煲仔饭', locationText: '二饭三楼' }),
      makeMerchant({ id: '2', name: '南亭隆江猪脚饭', locationText: '南亭村' }),
      makeMerchant({ id: '3', name: '煲仔饭', campusId: 'other', locationText: '其他校区' }),
      makeMerchant({ id: '4', name: '老广煲仔饭', status: 'rejected' }),
    ];

    const hits = findSimilarMerchants(candidates, '煲仔饭', 'hemc', '二饭三楼');
    expect(hits.map((h) => h.id)).toEqual(['1']);
    expect(hits[0]!.similarity).toBeGreaterThanOrEqual(0.5);
  });
});

describe('课表空档分析', () => {
  it('能识别午饭课间紧张窗口并保留上节地点', () => {
    const sessions: ClassSession[] = [
      {
        courseId: 'c1',
        name: '高数',
        teacher: null,
        location: '教3-305',
        color: '#4D9FFF',
        periodStart: 3,
        periodEnd: 4,
        start: '2026-11-21T02:25:00.000Z', // 10:25 北京
        end: '2026-11-21T04:00:00.000Z', // 12:00 北京
      },
      {
        courseId: 'c2',
        name: '物理实验',
        teacher: null,
        location: '实验二号楼',
        color: '#FFB020',
        periodStart: 5,
        periodEnd: 6,
        start: '2026-11-21T04:35:00.000Z', // 12:35 北京（仅 35 分钟空档）
        end: '2026-11-21T06:00:00.000Z',
      },
    ];

    const ctx = analyzeMealWindow(sessions, 'lunch');
    expect(ctx.availableMinutes).toBe(35);
    expect(ctx.lastClassLocation).toBe('教3-305');
    expect(ctx.hint).toContain('35 分钟');
  });

  it('按北京时间小时判断默认午饭/晚饭', () => {
    expect(defaultMealForHour(11)).toBe('lunch');
    expect(defaultMealForHour(13)).toBe('lunch');
    expect(defaultMealForHour(14)).toBe('dinner');
    expect(defaultMealForHour(18)).toBe('dinner');
  });
});

describe('吃什么规则推荐打分', () => {
  const baseSchedule = { availableMinutes: null, lastClassLocation: null, classCount: 2, hint: null };

  it('雨天/低温优先推荐热乎汤面，高温优先推荐清爽凉食', () => {
    const soup = makeMerchant({ id: 'soup', name: '潮汕汤粉', category: 'noodle', tags: ['汤', '面', '热食'], walkMinutes: 5 });
    const salad = makeMerchant({ id: 'salad', name: '轻食沙拉', category: 'fastfood', tags: ['凉食', '轻食', '清淡'], walkMinutes: 5 });

    const rainy = scoreAndRecommendMeals({
      merchants: [soup, salad],
      meal: 'lunch',
      weather: { temp: 14, feelsLike: 13, text: '小雨', scene: 'rain', humidity: 88 },
      schedule: baseSchedule,
      mood: null,
      preference: null,
      feedbacks: [],
    });
    expect(rainy[0]!.merchant.id).toBe('soup');

    const hot = scoreAndRecommendMeals({
      merchants: [soup, salad],
      meal: 'lunch',
      weather: { temp: 33, feelsLike: 35, text: '晴', scene: 'sunny', humidity: 60 },
      schedule: baseSchedule,
      mood: null,
      preference: null,
      feedbacks: [],
    });
    expect(hot[0]!.merchant.id).toBe('salad');
  });

  it('严格过滤忌口标签、未上架商家、非本餐营业商家及近期不想吃的店', () => {
    const spicy = makeMerchant({ id: 'spicy', name: '川味冒菜', tags: ['辣', '汤'] });
    const pending = makeMerchant({ id: 'pending', name: '待审小店', status: 'pending', tags: ['饭'] });
    const dinnerOnly = makeMerchant({ id: 'dinner', name: '夜宵烧烤', openHours: { meals: ['dinner'] }, tags: ['热食'] });
    const disliked = makeMerchant({ id: 'disliked', name: '上次踩雷', tags: ['饭'] });
    const good = makeMerchant({ id: 'good', name: '清汤滑蛋饭', tags: ['清淡', '饭'] });

    const res = scoreAndRecommendMeals({
      merchants: [spicy, pending, dinnerOnly, disliked, good],
      meal: 'lunch',
      weather: null,
      schedule: baseSchedule,
      mood: 'calm',
      preference: { tastes: ['清淡'], dislikes: ['辣'], budgetMin: null, budgetMax: null },
      feedbacks: [{ merchantId: 'disliked', action: 'disliked', daysAgo: 2, meal: 'lunch' }],
    });
    expect(res.map((r) => r.merchant.id)).toEqual(['good']);
  });

  it('近 3 天吃过的店会受到重复惩罚，且不同品类优先打散', () => {
    const n1 = makeMerchant({ id: 'n1', name: '牛肉面', category: 'noodle', tags: ['面', '汤', '热食'] });
    const n2 = makeMerchant({ id: 'n2', name: '螺蛳粉', category: 'noodle', tags: ['面', '汤', '热食'] });
    const n3 = makeMerchant({ id: 'n3', name: '重庆小面', category: 'noodle', tags: ['面', '汤', '热食'] });
    const rice = makeMerchant({ id: 'rice', name: '煲仔饭', category: 'canteen', tags: ['饭', '热食'] });
    const fast = makeMerchant({ id: 'fast', name: '黄焖鸡', category: 'fastfood', tags: ['饭', '热食'] });

    const res = scoreAndRecommendMeals({
      merchants: [n1, n2, n3, rice, fast],
      meal: 'lunch',
      weather: { temp: 15, feelsLike: 14, text: '小雨', scene: 'rain', humidity: 80 },
      schedule: baseSchedule,
      mood: 'tired',
      preference: null,
      feedbacks: [{ merchantId: 'n1', action: 'accepted', daysAgo: 1, meal: 'lunch' }],
    });

    expect(res).toHaveLength(3);
    // 三个推荐应分散在不同品类
    expect(new Set(res.map((r) => r.merchant.category)).size).toBe(3);
    // n1 昨天吃过，不应排在没吃过的同品类 n2/n3 前面
    expect(res.find((r) => r.merchant.id === 'n1')).toBeUndefined();
  });

  it('课间不足 45 分钟时，步行近的商家显著高于远的商家', () => {
    const near = makeMerchant({ id: 'near', name: '一饭快餐', walkMinutes: 3, tags: ['饭', '快手'] });
    const far = makeMerchant({ id: 'far', name: 'GOGO远店', walkMinutes: 20, tags: ['饭', '热食'] });

    const res = scoreAndRecommendMeals({
      merchants: [far, near],
      meal: 'lunch',
      weather: null,
      schedule: { availableMinutes: 30, lastClassLocation: '教3-201', classCount: 4, hint: '课间只有约 30 分钟' },
      mood: null,
      preference: null,
      feedbacks: [],
    });
    expect(res[0]!.merchant.id).toBe('near');
    expect(res[0]!.reason).toContain('步行约 3 分钟');
  });

  it('场景快选「结伴聚餐」优先火锅/餐厅，「一人快吃 + 赶时间」优先近且快的食堂档口', () => {
    const canteen = makeMerchant({
      id: 'canteen',
      name: '一饭烧腊',
      category: 'canteen',
      walkMinutes: 4,
      priceAvg: 15,
      tags: ['饭', '快手', '实惠'],
    });
    const hotpot = makeMerchant({
      id: 'hotpot',
      name: '南亭炭火烧烤',
      category: 'hotpot',
      walkMinutes: 14,
      priceAvg: 55,
      tags: ['汤', '热食', '聚餐'],
    });

    const groupRes = scoreAndRecommendMeals({
      merchants: [canteen, hotpot],
      meal: 'dinner',
      weather: null,
      schedule: baseSchedule,
      mood: null,
      preference: null,
      feedbacks: [],
      context: { party: 'group', pace: 'relaxed' },
    });
    expect(groupRes[0]!.merchant.id).toBe('hotpot');

    const soloRushRes = scoreAndRecommendMeals({
      merchants: [hotpot, canteen],
      meal: 'lunch',
      weather: null,
      schedule: baseSchedule,
      mood: null,
      preference: null,
      feedbacks: [],
      context: { party: 'solo', pace: 'rush' },
    });
    expect(soloRushRes[0]!.merchant.id).toBe('canteen');
  });
});

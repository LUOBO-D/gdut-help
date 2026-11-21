import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MerchantService } from './merchant.service.js';

function makeRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-11-21T03:00:00.000Z');
  return {
    id: '00000000-0000-0000-0000-000000000010',
    name: '老广煲仔饭',
    category: 'canteen',
    campusId: 'hemc',
    locationText: '二饭三楼',
    walkMinutes: 5,
    lat: null,
    lng: null,
    priceAvg: 16,
    tags: ['饭', '热食'],
    openHours: null,
    submittedBy: 'u1',
    confirmCount: 0,
    status: 'approved',
    ratingAvg: 0,
    ratingCount: 0,
    bayesScore: 0,
    dishes: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeService(autoApprove = true) {
  const prisma = {
    merchant: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    dish: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  };
  const env = { MERCHANT_AUTO_APPROVE: autoApprove } as Env;
  return { service: new MerchantService(prisma as unknown as PrismaService, env), prisma };
}

describe('MerchantService', () => {
  it('自用阶段（MERCHANT_AUTO_APPROVE=true）普通用户提交直接上架', async () => {
    const { service, prisma } = makeService(true);
    prisma.merchant.create.mockResolvedValue(makeRow({ status: 'approved' }));

    const result = await service.create(
      { id: 'u1', role: 'user' },
      {
        name: '老广煲仔饭',
        category: 'canteen',
        campusId: 'hemc',
        locationText: '二饭三楼',
        walkMinutes: 5,
        priceAvg: 16,
        tags: ['饭', '热食'],
      },
    );

    expect(result.status).toBe('approved');
    expect(prisma.merchant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'approved', submittedBy: 'u1' }) }),
    );
  });

  it('关闭自动上架后，普通用户提交进入 pending，管理员提交仍直接 approved', async () => {
    const { service, prisma } = makeService(false);
    prisma.merchant.create.mockResolvedValueOnce(makeRow({ status: 'pending' }));
    prisma.merchant.create.mockResolvedValueOnce(makeRow({ status: 'approved' }));

    const r1 = await service.create(
      { id: 'u1', role: 'user' },
      { name: '新店A', category: 'noodle', campusId: 'hemc', locationText: '一饭', priceAvg: 12, tags: ['面'] },
    );
    const r2 = await service.create(
      { id: 'admin1', role: 'admin' },
      { name: '新店B', category: 'noodle', campusId: 'hemc', locationText: '一饭', priceAvg: 12, tags: ['面'] },
    );

    expect(r1.status).toBe('pending');
    expect(r2.status).toBe('approved');
  });

  it('公开模式下普通用户单日提交超过 5 家会被限流拦截', async () => {
    const { service, prisma } = makeService(false);
    prisma.merchant.count.mockResolvedValue(5);

    await expect(
      service.create(
        { id: 'u1', role: 'user' },
        { name: '第6家店', category: 'noodle', campusId: 'hemc', locationText: '一饭', priceAvg: 12, tags: ['面'] },
      ),
    ).rejects.toMatchObject({ errorCode: 'TOO_MANY_REQUESTS' });
    expect(prisma.merchant.create).not.toHaveBeenCalled();
  });

  it('非本人且非管理员修改或删除商家会被拒绝（403）', async () => {
    const { service, prisma } = makeService(true);
    prisma.merchant.findUnique.mockResolvedValue(makeRow({ submittedBy: 'u1' }));

    await expect(service.remove({ id: 'u2', role: 'user' }, '00000000-0000-0000-0000-000000000010')).rejects.toMatchObject({
      errorCode: 'FORBIDDEN',
    });
  });

  it('实时查重按校区过滤并返回相近商家', async () => {
    const { service, prisma } = makeService(true);
    prisma.merchant.findMany.mockResolvedValue([
      makeRow({ id: 'm1', name: '二饭老广煲仔饭', locationText: '二饭三楼' }),
      makeRow({ id: 'm2', name: '隆江猪脚饭', locationText: '贝岗村' }),
    ]);

    const hits = await service.findSimilar({ name: '老广煲仔饭', campusId: 'hemc', locationText: '二饭三楼' });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.id).toBe('m1');
  });

  it('管理员可审核通过或标记关店', async () => {
    const { service, prisma } = makeService(false);
    prisma.merchant.findUnique.mockResolvedValue(makeRow({ status: 'pending' }));
    prisma.merchant.update.mockResolvedValue(makeRow({ status: 'closed' }));

    const updated = await service.setStatus('00000000-0000-0000-0000-000000000010', 'closed');
    expect(updated.status).toBe('closed');
  });
});

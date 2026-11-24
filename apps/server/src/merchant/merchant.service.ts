import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_CAMPUS_ID,
  ErrorCode,
  HEMC_SEED_MERCHANTS,
  findSimilarMerchants,
  normalizeMerchantName,
  type Dish,
  type DishInput,
  type Merchant,
  type MerchantCategory,
  type MerchantInput,
  type MerchantOpenHours,
  type MerchantStatus,
  type MerchantUpdateInput,
  type SeedImportResult,
  type SimilarMerchant,
} from '@gduthelp/shared';
import type { AuthUser } from '../auth/auth.decorators.js';
import { AppException } from '../common/app.exception.js';
import { ENV, type Env } from '../config/env.js';
import { Prisma, type Dish as DishRow, type Merchant as MerchantRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type MerchantWithDishes = MerchantRow & { dishes: DishRow[] };

function toDish(row: DishRow): Dish {
  return {
    id: row.id,
    merchantId: row.merchantId,
    name: row.name,
    price: row.price,
    tags: row.tags,
    createdAt: row.createdAt.toISOString(),
  };
}

function parseOpenHours(raw: unknown): MerchantOpenHours | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const meals = Array.isArray(obj.meals)
    ? obj.meals.filter((m): m is 'lunch' | 'dinner' => m === 'lunch' || m === 'dinner')
    : undefined;
  const text = typeof obj.text === 'string' && obj.text.trim() ? obj.text.trim() : undefined;
  if (!meals?.length && !text) return null;
  return { ...(meals?.length ? { meals } : {}), ...(text ? { text } : {}) };
}

function serializeOpenHours(
  openMeals?: ('lunch' | 'dinner')[],
  openHoursText?: string | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  const meals = openMeals?.length ? [...new Set(openMeals)] : undefined;
  const text = openHoursText?.trim() || undefined;
  if (!meals && !text) return Prisma.DbNull;
  return { ...(meals ? { meals } : {}), ...(text ? { text } : {}) };
}

export function toMerchant(row: MerchantWithDishes, viewer?: AuthUser): Merchant {
  const canSeeSubmitter = Boolean(viewer && (row.submittedBy === viewer.id || viewer.role === 'admin'));
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    campusId: row.campusId,
    locationText: row.locationText,
    walkMinutes: row.walkMinutes,
    priceAvg: row.priceAvg,
    tags: row.tags,
    openHours: parseOpenHours(row.openHours),
    submittedBy: canSeeSubmitter ? row.submittedBy : '',
    confirmCount: row.confirmCount,
    status: row.status,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    bayesScore: row.bayesScore,
    dishes: row.dishes.filter((d) => d.status === 'visible').map(toDish),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const INCLUDE_DISHES = {
  dishes: {
    where: { status: 'visible' as const },
    orderBy: { createdAt: 'asc' as const },
  },
};

const MAX_MERCHANTS_PER_DAY_PUBLIC = 5;
const MAX_MERCHANTS_PER_DAY_AUTO = 8;
const MAX_DISHES_PER_DAY = 30;
const MAX_DISHES_PER_MERCHANT = 50;

@Injectable()
export class MerchantService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** 浏览已上架商家（按校区、品类、关键词筛选） */
  async listApproved(
    opts: { campusId?: string; category?: MerchantCategory; q?: string },
    viewer?: AuthUser,
  ): Promise<Merchant[]> {
    const campusId = opts.campusId || DEFAULT_CAMPUS_ID;
    const q = opts.q?.trim();
    const rows = await this.prisma.merchant.findMany({
      where: {
        campusId,
        status: 'approved',
        ...(opts.category ? { category: opts.category } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { locationText: { contains: q, mode: 'insensitive' } },
                { tags: { has: q } },
              ],
            }
          : {}),
      },
      include: INCLUDE_DISHES,
      orderBy: [{ bayesScore: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map((r) => toMerchant(r, viewer));
  }

  /** 供推荐模块调用：获取指定校区全部已上架商家（含招牌菜品） */
  async listApprovedForCampus(campusId: string): Promise<Merchant[]> {
    const rows = await this.prisma.merchant.findMany({
      where: { campusId, status: 'approved' },
      include: INCLUDE_DISHES,
      orderBy: { createdAt: 'desc' },
      take: 250,
    });
    return rows.map((r) => toMerchant(r));
  }

  async getById(id: string, user: AuthUser): Promise<Merchant> {
    const row = await this.prisma.merchant.findUnique({ where: { id }, include: INCLUDE_DISHES });
    if (!row) throw new AppException(ErrorCode.NOT_FOUND, '商家不存在', HttpStatus.NOT_FOUND);
    if (row.status !== 'approved' && row.submittedBy !== user.id && user.role !== 'admin') {
      throw new AppException(ErrorCode.NOT_FOUND, '商家不存在', HttpStatus.NOT_FOUND);
    }
    return toMerchant(row, user);
  }

  /** 提交前实时查重：返回同校区名称/位置相近的已有商家 */
  async findSimilar(opts: {
    name: string;
    campusId?: string;
    locationText?: string;
    excludeId?: string;
  }): Promise<SimilarMerchant[]> {
    const campusId = opts.campusId || DEFAULT_CAMPUS_ID;
    const rows = await this.prisma.merchant.findMany({
      where: { campusId, status: { not: 'rejected' } },
      select: {
        id: true,
        name: true,
        category: true,
        campusId: true,
        locationText: true,
        priceAvg: true,
        status: true,
      },
      take: 500,
    });
    return findSimilarMerchants(rows, opts.name, campusId, opts.locationText, opts.excludeId);
  }

  /** 提交新商家：非管理员始终受每日提交配额保护，防止恶意刷屏污染全校商家库 */
  async create(user: AuthUser, input: MerchantInput): Promise<Merchant> {
    if (user.role !== 'admin') {
      const limit = this.env.MERCHANT_AUTO_APPROVE ? MAX_MERCHANTS_PER_DAY_AUTO : MAX_MERCHANTS_PER_DAY_PUBLIC;
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const count = await this.prisma.merchant.count({
        where: { submittedBy: user.id, createdAt: { gte: since } },
      });
      if (count >= limit) {
        throw new AppException(
          ErrorCode.TOO_MANY_REQUESTS,
          `每人每天最多提交 ${limit} 家商家，明天再来补充吧`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    const status: MerchantStatus = this.env.MERCHANT_AUTO_APPROVE || user.role === 'admin' ? 'approved' : 'pending';
    const row = await this.prisma.merchant.create({
      data: {
        name: input.name,
        category: input.category,
        campusId: input.campusId,
        locationText: input.locationText,
        walkMinutes: input.walkMinutes ?? null,
        priceAvg: input.priceAvg,
        tags: input.tags,
        openHours: serializeOpenHours(input.openMeals, input.openHoursText),
        submittedBy: user.id,
        status,
        ...(input.dishes?.length
          ? {
              dishes: {
                create: input.dishes.map((d) => ({
                  name: d.name,
                  price: d.price ?? null,
                  tags: d.tags,
                  submittedBy: user.id,
                })),
              },
            }
          : {}),
      },
      include: INCLUDE_DISHES,
    });
    return toMerchant(row, user);
  }

  async update(user: AuthUser, id: string, input: MerchantUpdateInput): Promise<Merchant> {
    const existing = await this.prisma.merchant.findUnique({ where: { id } });
    if (!existing) throw new AppException(ErrorCode.NOT_FOUND, '商家不存在', HttpStatus.NOT_FOUND);
    if (existing.submittedBy !== user.id && user.role !== 'admin') {
      throw new AppException(ErrorCode.FORBIDDEN, '只能修改自己提交的商家', HttpStatus.FORBIDDEN);
    }
    const row = await this.prisma.merchant.update({
      where: { id },
      data: {
        name: input.name,
        category: input.category,
        campusId: input.campusId,
        locationText: input.locationText,
        walkMinutes: input.walkMinutes ?? null,
        priceAvg: input.priceAvg,
        tags: input.tags,
        openHours: serializeOpenHours(input.openMeals, input.openHoursText),
      },
      include: INCLUDE_DISHES,
    });
    return toMerchant(row, user);
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const existing = await this.prisma.merchant.findUnique({ where: { id } });
    if (!existing) throw new AppException(ErrorCode.NOT_FOUND, '商家不存在', HttpStatus.NOT_FOUND);
    if (existing.submittedBy !== user.id && user.role !== 'admin') {
      throw new AppException(ErrorCode.FORBIDDEN, '只能删除自己提交的商家', HttpStatus.FORBIDDEN);
    }
    await this.prisma.merchant.delete({ where: { id } });
  }

  async addDish(user: AuthUser, merchantId: string, input: DishInput): Promise<Dish> {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new AppException(ErrorCode.NOT_FOUND, '商家不存在', HttpStatus.NOT_FOUND);
    if (merchant.status !== 'approved' && merchant.submittedBy !== user.id && user.role !== 'admin') {
      throw new AppException(ErrorCode.FORBIDDEN, '该商家尚未上架', HttpStatus.FORBIDDEN);
    }
    if (user.role !== 'admin') {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [merchantDishCount, userDailyCount] = await Promise.all([
        this.prisma.dish.count({ where: { merchantId, status: 'visible' } }),
        this.prisma.dish.count({ where: { submittedBy: user.id, createdAt: { gte: since } } }),
      ]);
      if (merchantDishCount >= MAX_DISHES_PER_MERCHANT) {
        throw new AppException(ErrorCode.VALIDATION_FAILED, '该商家招牌菜数量已达上限', HttpStatus.BAD_REQUEST);
      }
      if (userDailyCount >= MAX_DISHES_PER_DAY) {
        throw new AppException(ErrorCode.TOO_MANY_REQUESTS, '今天补充菜品太频繁了，明天再来吧', HttpStatus.TOO_MANY_REQUESTS);
      }
    }
    const dish = await this.prisma.dish.create({
      data: {
        merchantId,
        name: input.name,
        price: input.price ?? null,
        tags: input.tags,
        submittedBy: user.id,
      },
    });
    return toDish(dish);
  }

  async removeDish(user: AuthUser, merchantId: string, dishId: string): Promise<void> {
    const dish = await this.prisma.dish.findUnique({ where: { id: dishId } });
    if (!dish || dish.merchantId !== merchantId) {
      throw new AppException(ErrorCode.NOT_FOUND, '菜品不存在', HttpStatus.NOT_FOUND);
    }
    if (dish.submittedBy !== user.id && user.role !== 'admin') {
      throw new AppException(ErrorCode.FORBIDDEN, '只能删除自己补充的菜品', HttpStatus.FORBIDDEN);
    }
    await this.prisma.dish.delete({ where: { id: dishId } });
  }

  /** 管理后台：按状态查看所有商家 */
  async listForAdmin(status?: MerchantStatus): Promise<Merchant[]> {
    const rows = await this.prisma.merchant.findMany({
      where: status ? { status } : {},
      include: INCLUDE_DISHES,
      orderBy: [{ createdAt: 'desc' }],
      take: 300,
    });
    return rows.map((r) => toMerchant(r, { id: '', role: 'admin' }));
  }

  async setStatus(id: string, status: MerchantStatus): Promise<Merchant> {
    const existing = await this.prisma.merchant.findUnique({ where: { id } });
    if (!existing) throw new AppException(ErrorCode.NOT_FOUND, '商家不存在', HttpStatus.NOT_FOUND);
    const row = await this.prisma.merchant.update({
      where: { id },
      data: { status },
      include: INCLUDE_DISHES,
    });
    return toMerchant(row, { id: '', role: 'admin' });
  }

  /**
   * 一键导入广工大学城（hemc）默认种子商家包（按归一化名称幂等去重，不覆盖已有店铺）。
   * 管理员随时可导入补齐；自用模式（MERCHANT_AUTO_APPROVE=true）下商家库为空时普通用户也可一键初始化。
   */
  async seedHemcDefault(user: AuthUser): Promise<SeedImportResult> {
    const existing = await this.prisma.merchant.findMany({
      where: { campusId: 'hemc', status: { not: 'rejected' } },
      select: { name: true },
    });
    if (user.role !== 'admin' && (!this.env.MERCHANT_AUTO_APPROVE || existing.length > 0)) {
      throw new AppException(ErrorCode.FORBIDDEN, '仅管理员或空商家库冷启动时可导入默认商家包', HttpStatus.FORBIDDEN);
    }

    const existingNames = new Set(existing.map((e) => normalizeMerchantName(e.name)));
    let created = 0;
    let skipped = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const item of HEMC_SEED_MERCHANTS) {
        const key = normalizeMerchantName(item.name);
        if (existingNames.has(key)) {
          skipped++;
          continue;
        }
        existingNames.add(key);
        await tx.merchant.create({
          data: {
            name: item.name,
            category: item.category,
            campusId: item.campusId,
            locationText: item.locationText,
            walkMinutes: item.walkMinutes ?? null,
            priceAvg: item.priceAvg,
            tags: item.tags,
            openHours: serializeOpenHours(item.openMeals, item.openHoursText),
            submittedBy: user.id,
            status: 'approved',
            ...(item.dishes?.length
              ? {
                  dishes: {
                    create: item.dishes.map((d) => ({
                      name: d.name,
                      price: d.price ?? null,
                      tags: d.tags,
                      submittedBy: user.id,
                    })),
                  },
                }
              : {}),
          },
        });
        created++;
      }
    });

    return { created, skipped, total: HEMC_SEED_MERCHANTS.length };
  }
}

import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  MERCHANT_CATEGORIES,
  MERCHANT_STATUSES,
  dishInputSchema,
  merchantInputSchema,
  merchantUpdateSchema,
  type Dish,
  type DishInput,
  type Merchant,
  type MerchantInput,
  type MerchantUpdateInput,
  type SeedImportResult,
  type SimilarMerchant,
} from '@gduthelp/shared';
import { z } from 'zod';
import { AdminOnly, CurrentUser, type AuthUser } from '../auth/auth.decorators.js';
import { MerchantService } from './merchant.service.js';

const idParam = z.uuid();

const listQuerySchema = z.object({
  campusId: z.string().trim().max(32).optional(),
  category: z.enum(MERCHANT_CATEGORIES).optional(),
  q: z.string().trim().max(50).optional(),
});

const similarQuerySchema = z.object({
  name: z.string().trim().max(50).default(''),
  campusId: z.string().trim().max(32).optional(),
  locationText: z.string().trim().max(80).optional(),
  excludeId: z.uuid().optional(),
});

const adminListQuerySchema = z.object({
  status: z.enum(MERCHANT_STATUSES).optional(),
});

@Controller()
export class MerchantController {
  constructor(private readonly merchants: MerchantService) {}

  @Get('merchants')
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listQuerySchema }) q: z.output<typeof listQuerySchema>,
  ): Promise<Merchant[]> {
    return this.merchants.listApproved(q, user);
  }

  @Get('merchants/similar')
  similar(@Query({ schema: similarQuerySchema }) q: z.output<typeof similarQuerySchema>): Promise<SimilarMerchant[]> {
    return this.merchants.findSimilar(q);
  }

  @Post('merchants/seed-hemc')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  seedHemc(@CurrentUser() user: AuthUser): Promise<SeedImportResult> {
    return this.merchants.seedHemcDefault(user);
  }

  @Get('merchants/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id', { schema: idParam }) id: string): Promise<Merchant> {
    return this.merchants.getById(id, user);
  }

  @Post('merchants')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: merchantInputSchema }) body: MerchantInput,
  ): Promise<Merchant> {
    return this.merchants.create(user, body);
  }

  @Patch('merchants/:id')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: merchantUpdateSchema }) body: MerchantUpdateInput,
  ): Promise<Merchant> {
    return this.merchants.update(user, id, body);
  }

  @Delete('merchants/:id')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async remove(@CurrentUser() user: AuthUser, @Param('id', { schema: idParam }) id: string): Promise<null> {
    await this.merchants.remove(user, id);
    return null;
  }

  @Post('merchants/:id/dishes')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  addDish(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: dishInputSchema }) body: DishInput,
  ): Promise<Dish> {
    return this.merchants.addDish(user, id, body);
  }

  @Delete('merchants/:id/dishes/:dishId')
  @HttpCode(200)
  async removeDish(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Param('dishId', { schema: idParam }) dishId: string,
  ): Promise<null> {
    await this.merchants.removeDish(user, id, dishId);
    return null;
  }

  @Get('admin/merchants')
  @AdminOnly()
  adminList(@Query({ schema: adminListQuerySchema }) q: z.output<typeof adminListQuerySchema>): Promise<Merchant[]> {
    return this.merchants.listForAdmin(q.status);
  }

  @Post('admin/merchants/:id/approve')
  @AdminOnly()
  @HttpCode(200)
  approve(@Param('id', { schema: idParam }) id: string): Promise<Merchant> {
    return this.merchants.setStatus(id, 'approved');
  }

  @Post('admin/merchants/:id/reject')
  @AdminOnly()
  @HttpCode(200)
  reject(@Param('id', { schema: idParam }) id: string): Promise<Merchant> {
    return this.merchants.setStatus(id, 'rejected');
  }

  @Post('admin/merchants/:id/close')
  @AdminOnly()
  @HttpCode(200)
  close(@Param('id', { schema: idParam }) id: string): Promise<Merchant> {
    return this.merchants.setStatus(id, 'closed');
  }
}

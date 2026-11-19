import { Controller, Get, Query } from '@nestjs/common';
import { DEFAULT_CAMPUS_ID, findCampus, type WeatherReport } from '@gduthelp/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WeatherService } from './weather.service.js';

const querySchema = z
  .object({
    campusId: z.string().optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), { error: 'lat 和 lng 需要同时提供' });

@Controller('weather')
export class WeatherController {
  constructor(
    private readonly weather: WeatherService,
    private readonly prisma: PrismaService,
  ) {}

  /** 按坐标、指定校区或本人所在校区查询；都没有时用大学城校区 */
  @Get()
  async get(@CurrentUser() user: AuthUser, @Query({ schema: querySchema }) q: z.infer<typeof querySchema>): Promise<WeatherReport> {
    if (q.lat !== undefined && q.lng !== undefined) return this.weather.get(q.lat, q.lng, '当前位置');
    let campus = findCampus(q.campusId);
    if (!campus) {
      const me = await this.prisma.user.findUnique({ where: { id: user.id }, select: { campusId: true } });
      campus = findCampus(me?.campusId) ?? findCampus(DEFAULT_CAMPUS_ID)!;
    }
    return this.weather.get(campus.lat, campus.lng, campus.area);
  }
}

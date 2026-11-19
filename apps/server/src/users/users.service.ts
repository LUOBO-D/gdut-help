import { Injectable } from '@nestjs/common';
import { ErrorCode, type UpdateProfileRequest, type UserProfile } from '@gduthelp/shared';
import { AppException } from '../common/app.exception.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export function toUserProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    role: user.role,
    campusId: user.campusId,
    remindByEmail: user.remindByEmail,
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppException(ErrorCode.UNAUTHORIZED, '账号不存在', 401);
    return toUserProfile(user);
  }

  async updateProfile(userId: string, data: UpdateProfileRequest): Promise<UserProfile> {
    return toUserProfile(await this.prisma.user.update({ where: { id: userId }, data }));
  }
}

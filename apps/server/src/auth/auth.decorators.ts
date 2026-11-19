import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { UserRole } from '@gduthelp/shared';

export const IS_PUBLIC = 'auth:isPublic';
export const REQUIRE_ADMIN = 'auth:requireAdmin';

/** 标记无需登录即可访问的接口。其余接口默认都要求有效的 access token。 */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** 仅管理员可访问（role 来自 access token，最长 15 分钟后随刷新更新） */
export const AdminOnly = () => SetMetadata(REQUIRE_ADMIN, true);

export interface AuthUser {
  id: string;
  role: UserRole;
}

/** 读取当前登录用户（由 AuthGuard 写入 request.user）。 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

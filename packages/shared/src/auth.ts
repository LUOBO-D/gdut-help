import { z } from 'zod';
import { CAMPUSES } from './gdut.js';

export const EMAIL_CODE_LENGTH = 6;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: '邮箱格式不正确' }).max(254));

export const emailCodeRequestSchema = z.object({ email });
export type EmailCodeRequest = z.infer<typeof emailCodeRequestSchema>;

export const loginRequestSchema = z.object({
  email,
  code: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${EMAIL_CODE_LENGTH}}$`), {
      error: `验证码为 ${EMAIL_CODE_LENGTH} 位数字`,
    }),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const userRoleSchema = z.enum(['user', 'admin']);
export type UserRole = z.infer<typeof userRoleSchema>;

export interface UserProfile {
  id: string;
  email: string;
  nickname: string;
  avatarUrl: string | null;
  role: UserRole;
  campusId: string | null;
  remindByEmail: boolean;
  remindMeal: boolean;
  createdAt: string;
}

export const updateProfileSchema = z
  .object({
    nickname: z.string().trim().min(1, { error: '昵称不能为空' }).max(20, { error: '昵称最多 20 个字' }),
    campusId: z.string().refine((id) => CAMPUSES.some((c) => c.id === id), { error: '未知校区' }),
    remindByEmail: z.boolean(),
    remindMeal: z.boolean(),
  })
  .partial();
export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;

/** 登录与刷新令牌的返回内容。网页端的 refresh token 通过 HttpOnly Cookie 下发，不出现在响应体中。 */
export interface AuthSession {
  accessToken: string;
  /** access token 过期时间（ISO 字符串） */
  expiresAt: string;
  user: UserProfile;
  /** 只有 App 请求（带 NATIVE_CLIENT_HEADER）时才返回。App 页面和 API 不同源，用不了 Cookie */
  refreshToken?: string;
}
/** App 刷新、退出时在请求体里带上 refresh token；网页端不带请求体，走 Cookie */
export const nativeRefreshSchema = z.object({ refreshToken: z.string().min(1).max(256).optional() }).optional();
export type NativeRefreshRequest = z.infer<typeof nativeRefreshSchema>;

export interface EmailCodeSent {
  /** 下次可重新发送的秒数 */
  cooldownSeconds: number;
}

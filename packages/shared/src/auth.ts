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
  createdAt: string;
}

export const updateProfileSchema = z
  .object({
    nickname: z.string().trim().min(1, { error: '昵称不能为空' }).max(20, { error: '昵称最多 20 个字' }),
    campusId: z.string().refine((id) => CAMPUSES.some((c) => c.id === id), { error: '未知校区' }),
    remindByEmail: z.boolean(),
  })
  .partial();
export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;

/** 登录与刷新令牌的返回内容。refresh token 通过 HttpOnly Cookie 下发，不出现在响应体中。 */
export interface AuthSession {
  accessToken: string;
  /** access token 过期时间（ISO 字符串） */
  expiresAt: string;
  user: UserProfile;
}

export interface EmailCodeSent {
  /** 下次可重新发送的秒数 */
  cooldownSeconds: number;
}

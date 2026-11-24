import { z } from 'zod';
import { CAMPUSES } from './gdut.js';

export const EMAIL_CODE_LENGTH = 6;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: '邮箱格式不正确' }).max(254));

const code = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${EMAIL_CODE_LENGTH}}$`), {
    error: `验证码为 ${EMAIL_CODE_LENGTH} 位数字`,
  });

export const passwordSchema = z
  .string()
  .min(8, { error: '密码至少 8 位' })
  .max(72, { error: '密码最多 72 位' });

const optionalInviteCode = z
  .string()
  .trim()
  .max(32)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

export const emailCodeRequestSchema = z.object({ email, inviteCode: optionalInviteCode });
export type EmailCodeRequest = z.input<typeof emailCodeRequestSchema>;

export const loginRequestSchema = z.object({ email, code, inviteCode: optionalInviteCode });
export type LoginRequest = z.input<typeof loginRequestSchema>;

export const passwordLoginRequestSchema = z.object({
  email,
  password: z.string().min(1, { error: '请输入密码' }).max(72),
});
export type PasswordLoginRequest = z.infer<typeof passwordLoginRequestSchema>;

export const registerWithPasswordSchema = z.object({
  email,
  code,
  password: passwordSchema,
  nickname: z
    .string()
    .trim()
    .min(1, { error: '昵称不能为空' })
    .max(20, { error: '昵称最多 20 个字' })
    .optional(),
  inviteCode: optionalInviteCode,
});
export type RegisterWithPasswordRequest = z.input<typeof registerWithPasswordSchema>;

export const resetPasswordSchema = z.object({
  email,
  code,
  newPassword: passwordSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72).optional(),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;

export interface AuthConfig {
  /** 允许注册/登录的邮箱后缀白名单（空数组表示不限制，QQ/163/校内邮箱均可） */
  allowedEmailDomains: string[];
  /** 新用户注册是否需要邀请码 */
  inviteRequired: boolean;
  /** 当前发信模式：console 表示本地开发日志输出验证码，smtp 表示真实发信 */
  mailDriver: 'console' | 'smtp';
}

export const userRoleSchema = z.enum(['user', 'admin']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const CLASS_REMIND_OPTIONS = [0, 10, 15, 20] as const;
export type ClassRemindMinutes = (typeof CLASS_REMIND_OPTIONS)[number];

export interface UserProfile {
  id: string;
  email: string;
  nickname: string;
  avatarUrl: string | null;
  role: UserRole;
  campusId: string | null;
  remindByEmail: boolean;
  remindMeal: boolean;
  classRemindMinutes: number;
  hasPassword: boolean;
  createdAt: string;
}

export const updateProfileSchema = z
  .object({
    nickname: z.string().trim().min(1, { error: '昵称不能为空' }).max(20, { error: '昵称最多 20 个字' }),
    campusId: z.string().refine((id) => CAMPUSES.some((c) => c.id === id), { error: '未知校区' }),
    remindByEmail: z.boolean(),
    remindMeal: z.boolean(),
    classRemindMinutes: z
      .number()
      .int()
      .refine((v) => (CLASS_REMIND_OPTIONS as readonly number[]).includes(v), {
        error: '课前提醒仅支持关闭或提前 10 / 15 / 20 分钟',
      }),
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

export interface LogoutAllResult {
  revokedCount: number;
}

export interface UserSessionInfo {
  id: string;
  deviceLabel: string;
  platform: 'android' | 'ios' | 'desktop' | 'web';
  ipMasked: string | null;
  nativeVersion: number | null;
  createdAt: string;
  expiresAt: string;
}

export interface UserSecurityEvent {
  id: string;
  event: string;
  label: string;
  severity: 'info' | 'warn' | 'critical';
  ipMasked: string | null;
  deviceLabel: string | null;
  createdAt: string;
}

export interface UserSecurityOverview {
  activeSessions: UserSessionInfo[];
  recentEvents: UserSecurityEvent[];
}

export const deleteAccountSchema = z.object({
  confirmEmail: email,
});
export type DeleteAccountRequest = z.infer<typeof deleteAccountSchema>;

export interface UserDataExport {
  exportedAt: string;
  profile: UserProfile;
  preference: {
    tastes: string[];
    dislikes: string[];
    budgetMin: number | null;
    budgetMax: number | null;
  } | null;
  courses: {
    name: string;
    semester: string;
    teacher: string | null;
    location: string | null;
    source: string;
    slots: { weekday: number; periodStart: number; periodEnd: number; weeks: number[]; location: string | null }[];
  }[];
  exams?: {
    courseName: string;
    semester: string;
    examDate: string;
    startTime: string;
    endTime: string;
    location: string | null;
    seatNo: string | null;
    examType: string | null;
    campus: string | null;
    note: string | null;
    source: string;
  }[];
  fitnessRecords?: {
    academicYear: string;
    gradeYear: number;
    gender: string;
    heightCm: number | null;
    weightKg: number | null;
    lungCapacityMl: number | null;
    sprint50mSec: number | null;
    sitAndReachCm: number | null;
    standingLongJumpCm: number | null;
    strengthCount: number | null;
    enduranceSec: number | null;
    exempt: boolean;
    officialTotal: number | null;
    testedAt: string | null;
    note: string | null;
    source: string;
  }[];
  grades?: {
    semesterCode: string;
    semesterName: string;
    courseCode: string | null;
    courseName: string;
    credits: number;
    scoreText: string;
    gradePoint: number;
    courseType: string | null;
    examType: string | null;
    source: string;
  }[];
  todos: {
    title: string;
    note: string | null;
    dueAt: string | null;
    priority: number;
    repeat: string;
    completedAt: string | null;
    createdAt: string;
  }[];
  moodLogs: {
    date: string;
    mood: string;
    note: string | null;
  }[];
  reviews: {
    merchantName: string;
    scoreTaste: number;
    scoreValue: number;
    scoreEnv: number;
    scoreSpeed: number;
    scoreOverall: number;
    content: string;
    createdAt: string;
  }[];
}

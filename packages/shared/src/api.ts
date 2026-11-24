/** 所有接口统一的返回结构。code 为 0 表示成功。 */
export interface ApiResponse<T> {
  code: number | string;
  data: T;
  message: string;
}

/** 业务错误码，前端据此给出提示，不解析 message 文本。 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  EMAIL_CODE_COOLDOWN: 'EMAIL_CODE_COOLDOWN',
  EMAIL_CODE_DAILY_LIMIT: 'EMAIL_CODE_DAILY_LIMIT',
  EMAIL_CODE_INVALID: 'EMAIL_CODE_INVALID',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  CLIENT_UPGRADE_REQUIRED: 'CLIENT_UPGRADE_REQUIRED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** App 发请求时带上 `X-Client: native`，服务端改为在响应体里返回 refresh token（见 AuthSession.refreshToken） */
export const NATIVE_CLIENT_HEADER = 'x-client';
export const NATIVE_CLIENT_VALUE = 'native';

/** 原生外壳版本号请求头（如 `X-Native-Version: 7`），供服务端识别并逐步强制淘汰不安全的旧版 Debug 安装包 */
export const NATIVE_VERSION_HEADER = 'x-native-version';

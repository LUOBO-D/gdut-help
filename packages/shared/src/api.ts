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
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

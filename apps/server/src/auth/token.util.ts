import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { EMAIL_CODE_LENGTH } from '@gduthelp/shared';

export function generateEmailCode(): string {
  return randomInt(0, 10 ** EMAIL_CODE_LENGTH)
    .toString()
    .padStart(EMAIL_CODE_LENGTH, '0');
}

/** 验证码摘要绑定邮箱，同一个验证码换个邮箱无法通过。 */
export function hashEmailCode(secret: string, email: string, code: string): string {
  return createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

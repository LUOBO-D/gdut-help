import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { EMAIL_CODE_LENGTH } from '@gduthelp/shared';

const scryptAsync = promisify(scrypt);
const SCRYPT_KEYLEN = 64;
const PASSWORD_PREFIX = 'scrypt';

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

/** 恒定时间比对任意字符串（经 SHA-256 定长摘要后比对，避免长度与时序侧信道泄露） */
export function safeEqualText(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 使用 Node 内置 scrypt + 16 字节随机盐派生密码哈希，零原生编译依赖 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, SCRYPT_KEYLEN)) as Buffer;
  return `${PASSWORD_PREFIX}$${salt}$${derived.toString('hex')}`;
}

/** 恒定时间校验密码哈希 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== PASSWORD_PREFIX) return false;
  const [, salt, hashHex] = parts as [string, string, string];
  if (!salt || !hashHex) return false;
  const derived = (await scryptAsync(password, salt, SCRYPT_KEYLEN)) as Buffer;
  const expected = Buffer.from(hashHex, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** 固定虚假哈希，用于未知邮箱登录时平衡耗时，防止通过响应时间枚举注册邮箱 */
export const DUMMY_PASSWORD_HASH =
  'scrypt$00112233445566778899aabbccddeeff$' + '00'.repeat(SCRYPT_KEYLEN);

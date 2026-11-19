import type { Request } from 'express';

/** 客户端 IP。依赖 main.ts 中的 trust proxy 设置，只信任本机反向代理传来的 X-Forwarded-For。 */
export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

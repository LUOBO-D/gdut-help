import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const SAFE_REQ_ID = /^[a-zA-Z0-9._-]{8,64}$/;

export interface RequestWithId extends Request {
  requestId?: string;
}

/**
 * 为每个请求分配安全合规的 X-Request-Id，并附加基础安全响应头。
 * 不引入额外依赖，覆盖所有 API 响应（含异常响应）。
 */
export function createSecurityMiddleware(isProduction: boolean, allowCrossOrigin = false) {
  return function securityMiddleware(req: RequestWithId, res: Response, next: NextFunction) {
    const incoming = req.header('x-request-id');
    const requestId = incoming && SAFE_REQ_ID.test(incoming) ? incoming : randomUUID();
    req.requestId = requestId;

    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    res.setHeader('Cross-Origin-Resource-Policy', allowCrossOrigin ? 'cross-origin' : 'same-site');
    if (isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
  };
}

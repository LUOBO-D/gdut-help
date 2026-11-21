import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { finalize, type Observable } from 'rxjs';
import type { RequestWithId } from './security.middleware.js';

const SLOW_MS = 1000;

/**
 * 轻量请求观测拦截器：记录耗时与慢请求，跳过 /health 心跳；
 * 绝不输出 Authorization、Cookie 或请求体等敏感内容。
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<RequestWithId>();
    const res = context.switchToHttp().getResponse<Response>();
    const path = (req.originalUrl ?? req.url).split('?')[0] ?? req.url;
    if (path.endsWith('/health')) return next.handle();

    const started = Date.now();
    return next.handle().pipe(
      finalize(() => {
        const ms = Date.now() - started;
        const status = res.statusCode;
        const rid = req.requestId ? ` [${req.requestId.slice(0, 8)}]` : '';
        const line = `${req.method} ${path} ${status} ${ms}ms${rid}`;
        if (ms >= SLOW_MS) {
          this.logger.warn(`慢请求 ${line}`);
        } else if (status >= 500) {
          this.logger.error(line);
        } else {
          this.logger.debug(line);
        }
      }),
    );
  }
}

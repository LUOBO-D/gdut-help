import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { ApiResponse } from '@gduthelp/shared';
import { map, type Observable } from 'rxjs';

/** 把控制器返回值包装成 { code: 0, data, message }。 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next.handle().pipe(map((data) => ({ code: 0, data: data ?? (null as T), message: 'ok' })));
  }
}

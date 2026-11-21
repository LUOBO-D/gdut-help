import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ErrorCode, type ApiResponse } from '@gduthelp/shared';
import { AppException } from './app.exception.js';
import { clientIp } from './client-ip.js';
import type { RequestWithId } from './security.middleware.js';

const STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TOO_MANY_REQUESTS,
};

const DEFAULT_MESSAGES: Partial<Record<ErrorCode, string>> = {
  [ErrorCode.UNAUTHORIZED]: '请先登录',
  [ErrorCode.FORBIDDEN]: '没有权限',
  [ErrorCode.NOT_FOUND]: '资源不存在',
  [ErrorCode.TOO_MANY_REQUESTS]: '操作太频繁，请稍后再试',
  [ErrorCode.INTERNAL_ERROR]: '服务器开小差了，请稍后再试',
};

interface PrismaErrorLike {
  code?: string;
  name?: string;
}

/** 将 Prisma 常见已知错误码映射为友好的客户端响应，避免直接暴露 500 内部细节 */
function mapPrismaError(err: unknown): { status: number; code: ErrorCode; message: string } | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as PrismaErrorLike;
  if (typeof e.code !== 'string' || !e.code.startsWith('P')) return null;

  switch (e.code) {
    case 'P2002':
      return { status: HttpStatus.CONFLICT, code: ErrorCode.VALIDATION_FAILED, message: '数据已存在，请勿重复提交' };
    case 'P2025':
      return { status: HttpStatus.NOT_FOUND, code: ErrorCode.NOT_FOUND, message: '目标记录不存在或已被删除' };
    case 'P2003':
      return { status: HttpStatus.BAD_REQUEST, code: ErrorCode.VALIDATION_FAILED, message: '关联的数据不存在' };
    case 'P1001':
    case 'P1002':
    case 'P2024':
      return { status: HttpStatus.SERVICE_UNAVAILABLE, code: ErrorCode.INTERNAL_ERROR, message: '数据库暂时繁忙，请稍后再试' };
    default:
      return null;
  }
}

/** 所有异常统一输出为 { code, data: null, message }，未知异常不向客户端暴露细节。 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.adapterHost;
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<RequestWithId>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = ErrorCode.INTERNAL_ERROR;
    let message: string | undefined;

    if (exception instanceof AppException) {
      status = exception.getStatus();
      code = exception.errorCode;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_CODES[status] ?? (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_FAILED);
      if (code === ErrorCode.VALIDATION_FAILED) message = extractMessage(exception.getResponse());
    } else {
      const mapped = mapPrismaError(exception);
      if (mapped) {
        status = mapped.status;
        code = mapped.code;
        message = mapped.message;
      }
      if (status >= 500) {
        const rid = req?.requestId ? ` rid=${req.requestId}` : '';
        const meta = req ? `${req.method} ${(req.originalUrl ?? req.url).split('?')[0]} ip=${clientIp(req)}${rid}` : 'http';
        this.logger.error(`[${meta}] ${exception instanceof Error ? (exception.stack ?? exception.message) : String(exception)}`);
      }
    }

    const body: ApiResponse<null> = {
      code,
      data: null,
      message: message ?? DEFAULT_MESSAGES[code] ?? '请求有误',
    };
    httpAdapter.reply(ctx.getResponse(), body, status);
  }
}

function extractMessage(response: string | object): string | undefined {
  if (typeof response === 'string') return response;
  const message = (response as { message?: unknown }).message;
  if (Array.isArray(message)) {
    // 校验错误形如 "email: 邮箱格式不正确"，只把冒号后的说明给用户
    return message.map((m) => String(m).replace(/^[\w.[\]]+:\s*/, '')).join('；');
  }
  return typeof message === 'string' ? message : undefined;
}

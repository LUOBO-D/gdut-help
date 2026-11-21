import { HttpStatus, type ArgumentsHost } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { ErrorCode } from '@gduthelp/shared';
import { describe, expect, it, vi } from 'vitest';
import { AppException } from './app.exception.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

function runFilter(err: unknown) {
  const reply = vi.fn();
  const adapterHost = { httpAdapter: { reply } } as unknown as HttpAdapterHost;
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', url: '/api/v1/merchants', requestId: 'req-12345678', socket: { remoteAddress: '127.0.0.1' } }),
      getResponse: () => ({}),
    }),
  } as unknown as ArgumentsHost;

  const filter = new HttpExceptionFilter(adapterHost);
  filter.catch(err, host);
  const [, body, status] = reply.mock.calls[0]!;
  return { body, status };
}

describe('HttpExceptionFilter', () => {
  it('原样返回业务异常 AppException 的错误码和提示', () => {
    const { body, status } = runFilter(new AppException(ErrorCode.FORBIDDEN, '没有权限', HttpStatus.FORBIDDEN));
    expect(status).toBe(403);
    expect(body).toEqual({ code: ErrorCode.FORBIDDEN, data: null, message: '没有权限' });
  });

  it('将 Prisma 唯一约束冲突 P2002 映射为 409 友好提示', () => {
    const { body, status } = runFilter({ code: 'P2002', message: 'Unique constraint failed' });
    expect(status).toBe(409);
    expect(body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(body.message).toContain('重复');
  });

  it('将 Prisma 记录不存在 P2025 映射为 404，数据库不可达 P1001 映射为 503', () => {
    const r404 = runFilter({ code: 'P2025' });
    expect(r404.status).toBe(404);
    expect(r404.body.code).toBe(ErrorCode.NOT_FOUND);

    const r503 = runFilter({ code: 'P1001' });
    expect(r503.status).toBe(503);
    expect(r503.body.code).toBe(ErrorCode.INTERNAL_ERROR);
  });

  it('未知内部错误不向客户端泄露堆栈和原始错误信息', () => {
    const { body, status } = runFilter(new Error('secret SQL detail'));
    expect(status).toBe(500);
    expect(body.message).not.toContain('secret SQL');
  });
});

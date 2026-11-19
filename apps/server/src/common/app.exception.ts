import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@gduthelp/shared';

/** 业务异常：带一个稳定的错误码，前端据此判断，不解析 message。 */
export class AppException extends HttpException {
  constructor(
    readonly errorCode: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(message, status);
  }
}

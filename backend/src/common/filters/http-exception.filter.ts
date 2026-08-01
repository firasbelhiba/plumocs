import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';

/**
 * Maps every error to the consistent envelope (§13):
 *   { error: { code, message, details }, requestId }
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse();
    const req = ctx.getRequest();
    const requestId = req?.id ?? req?.headers?.['x-request-id'] ?? null;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        message = (b.message as string) ?? exception.message;
        if (Array.isArray(b.message)) {
          message = 'Validation failed';
          details = b.message;
        }
        if (b.code) code = String(b.code);
        if (b.details) details = b.details;
      }
      if (code === 'INTERNAL_ERROR') code = DEFAULT_CODES[status] ?? `HTTP_${status}`;
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    const payload = { error: { code, message, ...(details !== undefined ? { details } : {}) }, requestId };

    // Fastify reply
    if (typeof reply.code === 'function') {
      reply.code(status).send(payload);
    } else {
      reply.status(status).json(payload);
    }
  }
}

const DEFAULT_CODES: Record<number, string> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'BUSINESS_RULE_VIOLATION',
  429: 'RATE_LIMITED',
};

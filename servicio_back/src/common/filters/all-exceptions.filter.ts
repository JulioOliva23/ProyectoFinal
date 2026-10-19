import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client';

// BE-26 / BE-E14: unified global exception filter. Known Prisma request errors
// are translated to standard HTTP exceptions without exposing internal
// database details. Anything not recognised stays at 500.
const PRISMA_ERROR_STATUS: Record<string, HttpStatus> = {
  P2002: HttpStatus.CONFLICT,
  P2003: HttpStatus.CONFLICT,
  P2014: HttpStatus.CONFLICT,
  P2018: HttpStatus.CONFLICT,
  P2023: HttpStatus.BAD_REQUEST,
  P2025: HttpStatus.NOT_FOUND,
};

// Domain details a client may act on (e.g. the Stock Guard's missing parts,
// RN-09). Whitelisted so internal fields never leak.
const EXPOSED_DETAIL_KEYS = ['code', 'sparePartIds'] as const;
type ExposedDetails = Partial<Record<(typeof EXPOSED_DETAIL_KEYS)[number], unknown>>;

function pickExposedDetails(body: object): ExposedDetails {
  const details: ExposedDetails = {};
  for (const key of EXPOSED_DETAIL_KEYS) {
    if (key in body) details[key] = (body as Record<string, unknown>)[key];
  }
  return details;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let details: ExposedDetails = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'string' ? body : ((body as { message?: string | string[] }).message ?? message);
      if (typeof body === 'object' && body !== null) details = pickExposedDetails(body);
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      status = PRISMA_ERROR_STATUS[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Database operation failed';
    } else if (exception instanceof Prisma.PrismaClientInitializationError) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = 'Database is unavailable';
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...details,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
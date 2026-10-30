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

// Messages written by Nest itself (guards, pipes, router, throttler) arrive in
// English; they are translated here so every response is in Spanish (C6.2).
const BUILT_IN_MESSAGES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^Validation failed \(.*uuid.*\)/i, 'El identificador no es válido'],
  [/^Forbidden resource$/i, 'No tiene permiso para esta operación'],
  [/^Unauthorized$/i, 'No autenticado'],
  [/^Cannot (GET|POST|PUT|PATCH|DELETE) /, 'La ruta solicitada no existe'],
  [/Too Many Requests/i, 'Demasiadas solicitudes, espere un minuto'],
];

function translateBuiltIn(message: string): string {
  return BUILT_IN_MESSAGES.find(([pattern]) => pattern.test(message))?.[1] ?? message;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Error interno del servidor';
    let details: ExposedDetails = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      const raw = typeof body === 'string' ? body : ((body as { message?: string | string[] }).message ?? message);
      message = Array.isArray(raw) ? raw.map(translateBuiltIn) : translateBuiltIn(raw);
      if (typeof body === 'object' && body !== null) details = pickExposedDetails(body);
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      status = PRISMA_ERROR_STATUS[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'La operación en la base de datos falló';
    } else if (exception instanceof Prisma.PrismaClientInitializationError) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = 'La base de datos no está disponible';
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
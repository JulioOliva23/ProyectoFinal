import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../src/generated/prisma/client';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// BE-E14: the global filter translates known Prisma request errors to stable
// HTTP codes and hides internal database details. Unknown errors stay at 500.
describe('AllExceptionsFilter (BE-E14)', () => {
  const host = (): ArgumentsHost => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const request = { url: '/api/v1/test' };
    const http = {
      getResponse: () => response,
      getRequest: () => request,
    };
    return { switchToHttp: () => http } as unknown as ArgumentsHost;
  };

  const knownRequestError = (code: string): Prisma.PrismaClientKnownRequestError =>
    new Prisma.PrismaClientKnownRequestError(`prisma ${code}`, {
      code,
      clientVersion: '7.9.1',
    });

  const capture = (filter: AllExceptionsFilter, exception: unknown) => {
    const ctx = host();
    const response = ctx.switchToHttp().getResponse();
    filter.catch(exception, ctx);
    return response;
  };

  it.each([
    ['P2002', HttpStatus.CONFLICT],
    ['P2003', HttpStatus.CONFLICT],
    ['P2014', HttpStatus.CONFLICT],
    ['P2018', HttpStatus.CONFLICT],
    ['P2023', HttpStatus.BAD_REQUEST],
    ['P2025', HttpStatus.NOT_FOUND],
  ])('maps Prisma code %s to %i without leaking details', (code, expected) => {
    const response = capture(new AllExceptionsFilter(), knownRequestError(code));
    expect(response.status).toHaveBeenCalledWith(expected);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: expected,
        message: 'La operación en la base de datos falló',
        path: '/api/v1/test',
      }),
    );
  });

  it('keeps unknown Prisma request errors at 500 with hidden details', () => {
    const response = capture(new AllExceptionsFilter(), knownRequestError('P2024'));
    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'La operación en la base de datos falló' }),
    );
  });

  it('maps connection initialisation failures to 503', () => {
    const init = new Prisma.PrismaClientInitializationError('no database', '7.9.1');
    const response = capture(new AllExceptionsFilter(), init);
    expect(response.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'La base de datos no está disponible' }),
    );
  });

  it('passes HttpException status and message through', () => {
    const exception = new NotFoundException('order not found');
    const response = capture(new AllExceptionsFilter(), exception);
    expect(response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'order not found' }),
    );
  });

  it('translates the built-in Nest messages that reach the client [001/RNF-4]', () => {
    const cases: Array<[Error, string]> = [
      [new BadRequestException('Validation failed (uuid is expected)'), 'El identificador no es válido'],
      [new ForbiddenException('Forbidden resource'), 'No tiene permiso para esta operación'],
      [new UnauthorizedException('Unauthorized'), 'No autenticado'],
      [new NotFoundException('Cannot GET /api/v1/nothing'), 'La ruta solicitada no existe'],
    ];
    for (const [exception, expected] of cases) {
      const response = capture(new AllExceptionsFilter(), exception);
      expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ message: expected }));
    }
  });

  it('exposes whitelisted domain details such as the Stock Guard missing parts (RN-09)', () => {
    const exception = new UnprocessableEntityException({
      message: 'RN-09: insufficient stock to start the repair',
      code: 'INSUFFICIENT_STOCK',
      sparePartIds: ['p1'],
      internalNote: 'must not leak',
    });
    const response = capture(new AllExceptionsFilter(), exception);
    const body = response.json.mock.calls[0][0];
    expect(body).toMatchObject({ statusCode: 422, code: 'INSUFFICIENT_STOCK', sparePartIds: ['p1'] });
    expect(body).not.toHaveProperty('internalNote');
  });

  it('falls back to the default message when the HttpException body has none', () => {
    const exception = new BadRequestException({ statusCode: 400, error: 'Bad Request' });
    const response = capture(new AllExceptionsFilter(), exception);
    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Error interno del servidor' }),
    );
  });

  it('returns 500 for unknown errors', () => {
    const response = capture(new AllExceptionsFilter(), new Error('boom'));
    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Error interno del servidor' }),
    );
  });
});
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // BE-E08: @Public() exempts routes (login, refresh, public tracking) even
    // when the guard is registered globally via APP_GUARD.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    // Serve Swagger UI/spec without authentication.  All versioned API routes
    // live under /api/v1; everything served by SwaggerModule under /api (but
    // NOT /api/v1) is documentation.
    const path = (context.switchToHttp().getRequest<Request>()).path ?? '';
    if (path === '/api' || path === '/api/' || (path.startsWith('/api/') && !path.startsWith('/api/v1'))) {
      return true;
    }

    return super.canActivate(context);
  }
}

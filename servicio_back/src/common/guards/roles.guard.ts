import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../enums/user-role.enum';
import { isDocumentationPath } from './documentation-path';

// BE-29: role-based access control. Reads the roles required by @Roles and
// compares them against the current authenticated user.
// C7.1: it fails closed. A route must declare @Roles (or be @Public); one that
// declares neither is forbidden to everybody instead of open to any session.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const { user, path } = context.switchToHttp().getRequest<Request>();
    if (isDocumentationPath(path ?? '')) return true;

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, targets);
    if (!requiredRoles || requiredRoles.length === 0) {
      throw new ForbiddenException('Esta operación no tiene roles autorizados');
    }

    if (!user || !requiredRoles.includes(user.role as UserRole)) {
      throw new ForbiddenException('Su rol no permite esta operación');
    }

    return true;
  }
}

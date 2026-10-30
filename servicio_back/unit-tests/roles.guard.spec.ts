import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthController } from '../src/modules/auth/auth.controller';
import { Public } from '../src/common/decorators/public.decorator';
import { ROLES_KEY, Roles } from '../src/common/decorators/roles.decorator';
import { UserRole } from '../src/common/enums/user-role.enum';
import { RolesGuard } from '../src/common/guards/roles.guard';

class Sample {
  @Public()
  open() {
    return 'open';
  }

  @Roles(UserRole.ADMIN)
  adminOnly() {
    return 'admin';
  }

  forgotten() {
    return 'no decorator';
  }
}

function contextFor(handler: () => unknown, user?: { role: UserRole }, path = '/api/v1/sample'): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => Sample,
    switchToHttp: () => ({ getRequest: () => ({ user, path }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard (C7.1: a route without roles is closed)', () => {
  const guard = new RolesGuard(new Reflector());
  const sample = new Sample();

  it('lets a @Public route through without a user [001/RF-7]', () => {
    expect(guard.canActivate(contextFor(sample.open))).toBe(true);
  });

  it('lets a user with an allowed role through [001/RF-7]', () => {
    expect(guard.canActivate(contextFor(sample.adminOnly, { role: UserRole.ADMIN }))).toBe(true);
  });

  it('forbids a role that is not listed [001/RF-7]', () => {
    expect(() => guard.canActivate(contextFor(sample.adminOnly, { role: UserRole.CUSTOMER }))).toThrow(ForbiddenException);
  });

  it('forbids every role on a route that declares neither @Roles nor @Public [001/RF-7.3]', () => {
    for (const role of Object.values(UserRole)) {
      expect(() => guard.canActivate(contextFor(sample.forgotten, { role }))).toThrow(ForbiddenException);
    }
  });

  it('keeps serving the API documentation without roles [001/RF-7.1]', () => {
    expect(guard.canActivate(contextFor(sample.forgotten, undefined, '/api'))).toBe(true);
    expect(guard.canActivate(contextFor(sample.forgotten, undefined, '/api/docs'))).toBe(true);
  });

  it('declares every role explicitly on logout and profile, the routes that used to rely on the open default [001/RF-7.3]', () => {
    const everyRole = Object.values(UserRole).sort();
    for (const handler of [AuthController.prototype.logout, AuthController.prototype.profile]) {
      const declared = [...((Reflect.getMetadata(ROLES_KEY, handler) as UserRole[] | undefined) ?? [])].sort();
      expect(declared).toEqual(everyRole);
    }
  });
});

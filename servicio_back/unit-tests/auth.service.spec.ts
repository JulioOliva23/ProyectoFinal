jest.mock('argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AuthService } from '../src/modules/auth/auth.service';
import { UserRepository } from '../src/modules/users/repositories/user.repository';
import { RevokedRefreshTokenRepository } from '../src/modules/auth/repositories/revoked-refresh-token.repository';
import { UserRole } from '../src/common/enums/user-role.enum';

describe('AuthService (US-00)', () => {
  let service: AuthService;
  const repository = {
    findByUsername: jest.fn(),
    findActiveById: jest.fn(),
    invalidateSessions: jest.fn(),
  };
  const revocation = {
    findByJti: jest.fn(),
    create: jest.fn(),
    deleteExpired: jest.fn(),
  };
  const jwt = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };
  const config = {
    getOrThrow: jest.fn(),
    get: jest.fn(),
  };

  const user = {
    id: '00000000-0000-4000-8000-000000000010',
    username: 'recep01',
    fullName: 'Recepcionista Uno',
    role: UserRole.RECEPTIONIST,
    isActive: true,
    passwordHash: 'hashed-password',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    config.getOrThrow.mockImplementation((key: string) =>
      key === 'JWT_SECRET' ? 'access-secret-123'.padEnd(32, 'x') : 'refresh-secret-123'.padEnd(32, 'x'),
    );
    config.get.mockImplementation((key: string) => (key === 'JWT_EXPIRES_IN' ? '15m' : '7d'));
    jwt.signAsync.mockResolvedValue('signed-token');
    revocation.findByJti.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserRepository, useValue: repository },
        { provide: RevokedRefreshTokenRepository, useValue: revocation },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('returns an access + refresh token pair for valid credentials (US-00)', async () => {
    repository.findByUsername.mockResolvedValue(user);

    const result = await service.login({ username: 'recep01', password: 'Servicio2026!' });

    expect(result.accessToken).toBe('signed-token');
    expect(result.refreshToken).toBe('signed-token');
    expect(result.id).toBe(user.id);
    expect(result.role).toBe(UserRole.RECEPTIONIST);
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('returns 401 for an unknown or inactive user without leaking which case (US-00)', async () => {
    repository.findByUsername.mockResolvedValue(null);

    await expect(service.login({ username: 'nobody', password: 'x' })).rejects.toThrow(UnauthorizedException);

    repository.findByUsername.mockResolvedValue({ ...user, isActive: false });
    await expect(service.login({ username: 'recep01', password: 'x' })).rejects.toThrow(UnauthorizedException);
  });

  it('returns 401 when the password is incorrect (US-00)', async () => {
    repository.findByUsername.mockResolvedValue(user);
    (argon2.verify as jest.Mock).mockResolvedValue(false);

    await expect(service.login({ username: 'recep01', password: 'wrong' })).rejects.toThrow(UnauthorizedException);
  });

  it('issues a new token pair from a valid refresh token (US-00)', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: user.id, jti: 'jti-valid', exp: 1_000_000 });
    repository.findActiveById.mockResolvedValue(user);

    const result = await service.refresh({ refreshToken: 'valid-refresh' });

    expect(jwt.verifyAsync).toHaveBeenCalled();
    expect(result.id).toBe(user.id);
    expect(result.accessToken).toBe('signed-token');
  });

  it('rejects a refresh token minted before the last admin change to the account (US-21)', async () => {
    const changedAt = new Date('2026-10-29T12:00:00.500Z');
    jwt.verifyAsync.mockResolvedValue({ sub: user.id, jti: 'jti-old', iat: changedAt.getTime() / 1000 - 60, exp: 2_000_000_000 });
    repository.findActiveById.mockResolvedValue({ ...user, updatedAt: changedAt });

    await expect(service.refresh({ refreshToken: 'old-refresh' })).rejects.toThrow(UnauthorizedException);
    expect(revocation.create).not.toHaveBeenCalled();
  });

  it('accepts a refresh token minted after the change, even within the same second (US-21)', async () => {
    const changedAt = new Date('2026-10-29T12:00:00.500Z');
    jwt.verifyAsync.mockResolvedValue({ sub: user.id, jti: 'jti-new', iat: Math.floor(changedAt.getTime() / 1000), exp: 2_000_000_000 });
    repository.findActiveById.mockResolvedValue({ ...user, updatedAt: changedAt });

    await expect(service.refresh({ refreshToken: 'new-refresh' })).resolves.toMatchObject({ id: user.id });
  });

  it('rotates the used refresh token: revokes the old jti and mints a new pair (BE-E10)', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: user.id, jti: 'jti-used', exp: 1_000_000 });
    repository.findActiveById.mockResolvedValue(user);

    await service.refresh({ refreshToken: 'used-refresh' });

    expect(revocation.create).toHaveBeenCalledWith({
      jti: 'jti-used',
      userId: user.id,
      expiresAt: new Date(1_000_000 * 1000),
    });
    expect(revocation.deleteExpired).toHaveBeenCalledWith(expect.any(Date));
  });

  it('ends every session of the user and keeps the denylist when a refresh token is reused [001/RF-2.2]', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: user.id, jti: 'jti-stolen', exp: 1_000_000 });
    repository.findActiveById.mockResolvedValue(user);
    revocation.findByJti.mockResolvedValue({ jti: 'jti-stolen' });

    await expect(service.refresh({ refreshToken: 'stolen-refresh' })).rejects.toThrow(UnauthorizedException);

    expect(repository.invalidateSessions).toHaveBeenCalledWith(user.id);
    expect(revocation).not.toHaveProperty('deleteManyByUser');
    expect(revocation.create).not.toHaveBeenCalled();
  });

  it('still runs the password check for an unknown user so the response time does not reveal it [001/RNF-3]', async () => {
    repository.findByUsername.mockResolvedValue(null);

    await expect(service.login({ username: 'ghost', password: 'whatever' })).rejects.toThrow(UnauthorizedException);

    expect(argon2.verify).toHaveBeenCalledTimes(1);
  });

  it('still runs the password check for an inactive user [001/RNF-3]', async () => {
    repository.findByUsername.mockResolvedValue({ ...user, isActive: false });
    (argon2.verify as jest.Mock).mockResolvedValue(true);

    await expect(service.login({ username: 'recep01', password: 'Servicio2026!' })).rejects.toThrow(UnauthorizedException);

    expect(argon2.verify).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when a refresh token has no jti (legacy token, BE-E10)', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: user.id });

    await expect(service.refresh({ refreshToken: 'legacy-refresh' })).rejects.toThrow(UnauthorizedException);
  });

  it('returns 401 for an invalid refresh token (US-00)', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('invalid'));

    await expect(service.refresh({ refreshToken: 'bad' })).rejects.toThrow(UnauthorizedException);
  });

  it('logout revokes the refresh token in the denylist (BE-E10)', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: user.id, jti: 'jti-logout', exp: 1_000_000 });

    await expect(service.logout({ refreshToken: 'to-revoke' })).resolves.toBeUndefined();

    expect(revocation.create).toHaveBeenCalledWith({
      jti: 'jti-logout',
      userId: user.id,
      expiresAt: new Date(1_000_000 * 1000),
    });
  });

  it('logout is idempotent when the refresh token is already revoked (BE-E10)', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: user.id, jti: 'jti-already' });
    revocation.findByJti.mockResolvedValue({ jti: 'jti-already' });

    await expect(service.logout({ refreshToken: 'again' })).resolves.toBeUndefined();

    expect(revocation.create).not.toHaveBeenCalled();
  });

  it('logout returns 401 for an invalid refresh token (BE-E10)', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('invalid'));

    await expect(service.logout({ refreshToken: 'bad' })).rejects.toThrow(UnauthorizedException);
  });

  it('returns the profile of an active user without the hash (US-00)', async () => {
    repository.findActiveById.mockResolvedValue(user);

    const result = await service.getProfile(user.id);

    expect(result.id).toBe(user.id);
    expect(result.role).toBe(UserRole.RECEPTIONIST);
    expect(result).not.toHaveProperty('passwordHash');
  });
});

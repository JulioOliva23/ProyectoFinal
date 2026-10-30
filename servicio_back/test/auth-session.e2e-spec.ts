import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createValidationPipe } from '../src/common/validation/validation-messages';
import { PrismaService } from '../src/prisma/prisma.service';

// Spec 001 against the real AppModule and PostgreSQL. Each describe boots its
// own application so the in-memory login throttle never leaks between them.
async function boot(): Promise<{ app: INestApplication; prisma: PrismaService }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(createValidationPipe());
  app.setGlobalPrefix('api/v1');
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

describe('Session control (e2e)', () => {
  const run = randomUUID().slice(0, 8);
  const password = `E2e-${randomUUID()}`;
  const username = `session-${run}`;

  async function createUser(prisma: PrismaService) {
    return prisma.user.create({
      data: { username, passwordHash: await argon2.hash(password), fullName: `Sesión ${run}`, role: 'RECEPTIONIST' },
    });
  }

  describe('Reusing a rotated refresh token [001/RF-2]', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let userId: string;
    const http = () => request(app.getHttpServer());
    const login = () => http().post('/api/v1/auth/login').send({ username, password }).expect(200);
    const refresh = (refreshToken: string) => http().post('/api/v1/auth/refresh').send({ refreshToken });
    // A reuse ends the sessions up to one second ahead, so each test starts after that window.
    const afterTheWindow = () => new Promise((resolve) => setTimeout(resolve, 1200));

    beforeAll(async () => {
      ({ app, prisma } = await boot());
      userId = (await createUser(prisma)).id;
    });
    afterAll(async () => app.close());

    it('rotates the token and rejects the used one [001/RF-2.1]', async () => {
      await afterTheWindow();
      const first = (await login()).body.refreshToken as string;
      const second = await refresh(first).expect(200);
      expect(second.body.refreshToken).not.toBe(first);
      await refresh(first).expect(401);
    });

    it('ends every session, including the newest one, and keeps the denylist [001/RF-2.2]', async () => {
      await afterTheWindow();
      const first = (await login()).body.refreshToken as string;
      const newest = (await refresh(first).expect(200)).body.refreshToken as string;
      const deniedBefore = await prisma.revokedRefreshToken.count({ where: { userId } });

      const replay = await refresh(first).expect(401);
      expect(replay.body.message).toContain('reutilizado');

      // The honest holder of the newest token is cut off too: the family leaked.
      await refresh(newest).expect(401);
      // The denylist rows were not erased: the rotated tokens stay dead.
      expect(await prisma.revokedRefreshToken.count({ where: { userId } })).toBeGreaterThanOrEqual(deniedBefore);
      await refresh(first).expect(401);
    });

    it('lets the person sign in again afterwards [001/RF-2.2]', async () => {
      await afterTheWindow();
      const fresh = (await login()).body.refreshToken as string;
      await refresh(fresh).expect(200);
    });

    it('answers the same way for an unknown user and a wrong password [001/RF-1.2]', async () => {
      const wrong = await http().post('/api/v1/auth/login').send({ username, password: 'incorrecta' }).expect(401);
      const unknown = await http().post('/api/v1/auth/login').send({ username: `ghost-${run}`, password: 'incorrecta' }).expect(401);
      expect(unknown.body.message).toBe(wrong.body.message);
    });

    it('requires a session for logout and profile, and accepts every role [001/RF-7]', async () => {
      await http().get('/api/v1/auth/profile').expect(401);
      const pair = (await login()).body as { accessToken: string; refreshToken: string };
      const profile = await http().get('/api/v1/auth/profile').set('Authorization', `Bearer ${pair.accessToken}`).expect(200);
      expect(profile.body).toMatchObject({ username });
      expect(profile.body).not.toHaveProperty('passwordHash');
      await http().post('/api/v1/auth/logout').set('Authorization', `Bearer ${pair.accessToken}`).send({ refreshToken: pair.refreshToken }).expect(204);
      await http().post('/api/v1/auth/logout').set('Authorization', `Bearer ${pair.accessToken}`).send({ refreshToken: pair.refreshToken }).expect(204);
    });
  });

  describe('Login rate limit [001/RF-6]', () => {
    let app: INestApplication;
    beforeAll(async () => {
      ({ app } = await boot());
    });
    afterAll(async () => app.close());

    it('rejects the 11th attempt within a minute with a Spanish message [001/RF-6.1]', async () => {
      const http = () => request(app.getHttpServer());
      const statuses: number[] = [];
      let last: request.Response | undefined;
      for (let attempt = 0; attempt < 11; attempt += 1) {
        last = await http().post('/api/v1/auth/login').send({ username: `nobody-${run}`, password: 'incorrecta' });
        statuses.push(last.status);
      }
      expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
      expect(statuses[10]).toBe(429);
      expect(last?.body.message).toBe('Demasiadas solicitudes, espere un minuto');
    });
  });
});

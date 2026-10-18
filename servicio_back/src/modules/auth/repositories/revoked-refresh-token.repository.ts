import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

// BE-E10 / US-00: data access for the refresh-token denylist. Expired rows are
// removed lazily on every refresh (deleteExpired), keeping the table bounded.
@Injectable()
export class RevokedRefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByJti(jti: string) {
    return this.prisma.revokedRefreshToken.findUnique({ where: { jti } });
  }

  create(data: { jti: string; userId: string; expiresAt: Date }) {
    return this.prisma.revokedRefreshToken.create({ data });
  }

  deleteManyByUser(userId: string) {
    return this.prisma.revokedRefreshToken.deleteMany({ where: { userId } });
  }

  deleteExpired(now: Date) {
    return this.prisma.revokedRefreshToken.deleteMany({ where: { expiresAt: { lt: now } } });
  }
}
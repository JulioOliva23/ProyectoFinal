import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

const PUBLIC_USER = { id: true, username: true, fullName: true, role: true, customerId: true, isActive: true } as const;

// BE-08: PrismaService is only injected inside repositories.
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  findActiveById(id: string) {
    return this.prisma.user.findFirst({ where: { id, isActive: true } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id }, select: PUBLIC_USER });
  }

  findActiveWithRole(id: string, role: string) {
    return this.prisma.user.findFirst({ where: { id, role, isActive: true }, select: PUBLIC_USER });
  }

  customerExists(customerId: string): Promise<boolean> {
    return this.prisma.customer.count({ where: { id: customerId } }).then((count) => count === 1);
  }

  create(data: { username: string; passwordHash: string; fullName: string; role: string; customerId?: string }) {
    return this.prisma.user.create({ data, select: PUBLIC_USER });
  }

  list(filter: { role?: string; includeInactive: boolean }) {
    return this.prisma.user.findMany({
      where: { ...(filter.includeInactive ? {} : { isActive: true }), ...(filter.role ? { role: filter.role } : {}) },
      select: PUBLIC_USER,
      orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
    });
  }

  // Every write bumps updated_at, which also ends the user's older refresh
  // tokens (AuthService.refresh).
  update(id: string, data: { fullName?: string; role?: string; passwordHash?: string; isActive?: boolean }) {
    return this.prisma.user.update({ where: { id }, data, select: PUBLIC_USER });
  }
}

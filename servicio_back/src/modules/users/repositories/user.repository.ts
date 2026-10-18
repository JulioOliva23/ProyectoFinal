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

  findActiveWithRole(id: string, role: string) {
    return this.prisma.user.findFirst({ where: { id, role, isActive: true }, select: PUBLIC_USER });
  }

  customerExists(customerId: string): Promise<boolean> {
    return this.prisma.customer.count({ where: { id: customerId } }).then((count) => count === 1);
  }

  create(data: { username: string; passwordHash: string; fullName: string; role: string; customerId?: string }) {
    return this.prisma.user.create({ data, select: PUBLIC_USER });
  }

  listActive(role?: string) {
    return this.prisma.user.findMany({
      where: { isActive: true, ...(role ? { role } : {}) },
      select: PUBLIC_USER,
      orderBy: { fullName: 'asc' },
    });
  }

  // BE-18: logical deactivation only.
  deactivate(id: string) {
    return this.prisma.user.update({ where: { id }, data: { isActive: false }, select: PUBLIC_USER });
  }
}

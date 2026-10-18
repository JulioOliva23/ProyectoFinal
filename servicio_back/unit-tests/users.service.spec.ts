import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { UserRole } from '../src/common/enums/user-role.enum';
import { UserRepository } from '../src/modules/users/repositories/user.repository';
import { UsersService } from '../src/modules/users/users.service';

describe('UsersService', () => {
  let repository: jest.Mocked<UserRepository>;
  let service: UsersService;
  const base = { username: 'tecnico09', password: 'Str0ngPassword', fullName: 'Técnico Nueve', role: UserRole.TECHNICIAN };

  beforeEach(() => {
    repository = {
      findByUsername: jest.fn().mockResolvedValue(null),
      customerExists: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockImplementation(async (data) => ({ id: 'u1', isActive: true, customerId: null, ...data })),
      findActiveWithRole: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;
    service = new UsersService(repository);
  });

  it('hashes the password with argon2 and never returns it (BE-28)', async () => {
    const result = await service.create(base);
    const stored = repository.create.mock.calls[0][0];
    expect(stored.passwordHash).toMatch(/^\$argon2/);
    expect(result).not.toHaveProperty('password');
  });

  it('rejects binding a staff user to a customer (RN-14)', async () => {
    await expect(service.create({ ...base, customerId: 'c1' })).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects a duplicated username', async () => {
    repository.findByUsername.mockResolvedValue({ id: 'x' } as never);
    await expect(service.create(base)).rejects.toBeInstanceOf(ConflictException);
  });

  it('only accepts active technicians as assignees (RN-06)', async () => {
    repository.findActiveWithRole.mockResolvedValue(null);
    await expect(service.assertActiveTechnician('u2')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

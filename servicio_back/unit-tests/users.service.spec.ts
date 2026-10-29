import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { UserRole } from '../src/common/enums/user-role.enum';
import { UserRepository } from '../src/modules/users/repositories/user.repository';
import { UsersService } from '../src/modules/users/users.service';

describe('UsersService', () => {
  let repository: jest.Mocked<UserRepository>;
  let service: UsersService;
  const base = { username: 'tecnico09', password: 'Str0ngPassword', fullName: 'Técnico Nueve', role: UserRole.TECHNICIAN };
  const stored = { id: 'u1', username: 'tecnico09', fullName: 'Técnico Nueve', role: UserRole.TECHNICIAN as string, customerId: null, isActive: true };
  const admin = { id: 'admin-1', role: UserRole.ADMIN };
  const receptionist = { id: 'recep-1', role: UserRole.RECEPTIONIST };

  beforeEach(() => {
    repository = {
      findByUsername: jest.fn().mockResolvedValue(null),
      customerExists: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockImplementation(async (data) => ({ id: 'u1', isActive: true, customerId: null, ...data })),
      findActiveWithRole: jest.fn(),
      findById: jest.fn().mockImplementation(async (id: string) => ({ ...stored, id })),
      list: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(async (id: string, data: object) => ({ ...stored, id, ...data })),
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

  describe('list (US-21)', () => {
    it('includes inactive users only for ADMIN', async () => {
      await service.list({ includeInactive: true }, admin);
      expect(repository.list).toHaveBeenLastCalledWith({ role: undefined, includeInactive: true });
      await service.list({ role: UserRole.TECHNICIAN, includeInactive: true }, receptionist);
      expect(repository.list).toHaveBeenLastCalledWith({ role: UserRole.TECHNICIAN, includeInactive: false });
    });
  });

  describe('update (US-21)', () => {
    it('edits the name and the staff role', async () => {
      const result = await service.update('u1', { fullName: 'Ana Rojas', role: UserRole.RECEPTIONIST }, admin);
      expect(repository.update).toHaveBeenCalledWith('u1', { fullName: 'Ana Rojas', role: UserRole.RECEPTIONIST });
      expect(result).toMatchObject({ fullName: 'Ana Rojas', role: UserRole.RECEPTIONIST });
    });

    it('never turns staff into CUSTOMER nor a customer into staff (RN-14)', async () => {
      await expect(service.update('u1', { role: UserRole.CUSTOMER }, admin)).rejects.toBeInstanceOf(UnprocessableEntityException);
      repository.findById.mockResolvedValueOnce({ ...stored, role: UserRole.CUSTOMER, customerId: 'c1' });
      await expect(service.update('u1', { role: UserRole.TECHNICIAN }, admin)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('does not let an admin change their own role', async () => {
      repository.findById.mockResolvedValueOnce({ ...stored, id: 'admin-1', role: UserRole.ADMIN });
      await expect(service.update('admin-1', { role: UserRole.TECHNICIAN }, admin)).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('lets an admin rename themself', async () => {
      repository.findById.mockResolvedValueOnce({ ...stored, id: 'admin-1', role: UserRole.ADMIN });
      await expect(service.update('admin-1', { fullName: 'Admin Nuevo', role: UserRole.ADMIN }, admin)).resolves.toMatchObject({ fullName: 'Admin Nuevo' });
    });

    it('answers 404 for an unknown user', async () => {
      repository.findById.mockResolvedValueOnce(null);
      await expect(service.update('nope', { fullName: 'Nadie Aquí' }, admin)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('resetPassword (US-21)', () => {
    it('stores only the new argon2 hash', async () => {
      await service.resetPassword('u1', 'N3wPassword!');
      const [, data] = repository.update.mock.calls[0];
      expect(data.passwordHash).toMatch(/^\$argon2/);
      expect(JSON.stringify(data)).not.toContain('N3wPassword!');
    });
  });

  describe('activation (US-21 / BE-18)', () => {
    it('deactivates another user logically', async () => {
      await expect(service.deactivate('u1', admin)).resolves.toMatchObject({ isActive: false });
      expect(repository.update).toHaveBeenCalledWith('u1', { isActive: false });
    });

    it('does not let an admin deactivate their own account', async () => {
      await expect(service.deactivate('admin-1', admin)).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('answers 404 when the user is already inactive', async () => {
      repository.findById.mockResolvedValueOnce({ ...stored, isActive: false });
      await expect(service.deactivate('u1', admin)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reactivates an inactive user and is idempotent for an active one', async () => {
      repository.findById.mockResolvedValueOnce({ ...stored, isActive: false });
      await expect(service.activate('u1')).resolves.toMatchObject({ isActive: true });
      expect(repository.update).toHaveBeenCalledWith('u1', { isActive: true });
      repository.update.mockClear();
      await expect(service.activate('u1')).resolves.toMatchObject({ isActive: true });
      expect(repository.update).not.toHaveBeenCalled();
    });
  });
});

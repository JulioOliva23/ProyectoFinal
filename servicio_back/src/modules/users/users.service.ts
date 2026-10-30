import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateUserDto, QueryUsersDto, UpdateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user.response.dto';
import { UserRepository } from './repositories/user.repository';

type UserRow = { id: string; username: string; fullName: string; role: string; customerId: string | null; isActive: boolean };

@Injectable()
export class UsersService {
  constructor(private readonly repository: UserRepository) {}

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    // RN-14: only CUSTOMER accounts are bound to a customer record.
    if (dto.role !== UserRole.CUSTOMER && dto.customerId) {
      throw new UnprocessableEntityException('RN-14: solo las cuentas de Cliente se vinculan a un cliente');
    }
    if (dto.customerId && !(await this.repository.customerExists(dto.customerId))) {
      throw new NotFoundException('El cliente no existe');
    }
    if (await this.repository.findByUsername(dto.username)) {
      throw new ConflictException('Ese nombre de usuario ya está en uso');
    }
    const user = await this.repository.create({
      username: dto.username,
      passwordHash: await argon2.hash(dto.password),
      fullName: dto.fullName,
      role: dto.role,
      customerId: dto.customerId,
    });
    return toResponse(user);
  }

  // US-21: inactive accounts are listed only for ADMIN; everyone else keeps
  // the active-only list (e.g. reception picking a technician, RN-06).
  async list(query: QueryUsersDto, viewer: AuthenticatedUser): Promise<UserResponseDto[]> {
    const includeInactive = viewer.role === UserRole.ADMIN && query.includeInactive === true;
    return (await this.repository.list({ role: query.role, includeInactive })).map(toResponse);
  }

  // US-21: name and role. A CUSTOMER account is tied to its customer record
  // (RN-14), so it never becomes staff and staff never becomes CUSTOMER.
  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser): Promise<UserResponseDto> {
    const user = await this.requireUser(id);
    if (dto.role && dto.role !== user.role) {
      if (user.role === UserRole.CUSTOMER || dto.role === UserRole.CUSTOMER) {
        throw new UnprocessableEntityException('RN-14: las cuentas de cliente no pueden cambiar de rol');
      }
      assertNotSelf(id, actor, 'cambiar su propio rol');
    }
    return toResponse(await this.repository.update(id, { fullName: dto.fullName, role: dto.role }));
  }

  // US-21: the admin sets a new password; the user's older refresh tokens
  // stop working because the update bumps updated_at.
  async resetPassword(id: string, password: string): Promise<void> {
    await this.requireUser(id);
    await this.repository.update(id, { passwordHash: await argon2.hash(password) });
  }

  async deactivate(id: string, actor: AuthenticatedUser): Promise<UserResponseDto> {
    const user = await this.requireUser(id);
    if (!user.isActive) throw new NotFoundException('El usuario no existe');
    assertNotSelf(id, actor, 'desactivar su propia cuenta');
    return toResponse(await this.repository.update(id, { isActive: false }));
  }

  async activate(id: string): Promise<UserResponseDto> {
    const user = await this.requireUser(id);
    if (user.isActive) return toResponse(user);
    return toResponse(await this.repository.update(id, { isActive: true }));
  }

  // RN-06: used by work orders to validate an assignment target.
  async assertActiveTechnician(id: string): Promise<void> {
    if (!(await this.repository.findActiveWithRole(id, UserRole.TECHNICIAN))) {
      throw new UnprocessableEntityException('RN-06: la persona asignada debe ser un técnico activo');
    }
  }

  private async requireUser(id: string): Promise<UserRow> {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('El usuario no existe');
    return user;
  }
}

// An admin cannot lock themself out (and leave the shop without an admin).
function assertNotSelf(id: string, actor: AuthenticatedUser, action: string): void {
  if (id === actor.id) throw new UnprocessableEntityException(`No puede ${action}`);
}

function toResponse(user: UserRow): UserResponseDto {
  return { ...user, role: user.role as UserRole };
}

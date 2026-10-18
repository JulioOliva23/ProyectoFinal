import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UserRole } from '../../common/enums/user-role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user.response.dto';
import { UserRepository } from './repositories/user.repository';

type UserRow = { id: string; username: string; fullName: string; role: string; customerId: string | null; isActive: boolean };

@Injectable()
export class UsersService {
  constructor(private readonly repository: UserRepository) {}

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    // RN-14: only CUSTOMER accounts are bound to a customer record.
    if (dto.role !== UserRole.CUSTOMER && dto.customerId) {
      throw new UnprocessableEntityException('RN-14: only CUSTOMER users can be bound to a customer');
    }
    if (dto.customerId && !(await this.repository.customerExists(dto.customerId))) {
      throw new NotFoundException('Customer not found');
    }
    if (await this.repository.findByUsername(dto.username)) {
      throw new ConflictException('Username already taken');
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

  async list(role?: UserRole): Promise<UserResponseDto[]> {
    return (await this.repository.listActive(role)).map(toResponse);
  }

  async deactivate(id: string): Promise<UserResponseDto> {
    if (!(await this.repository.findActiveById(id))) throw new NotFoundException('User not found');
    return toResponse(await this.repository.deactivate(id));
  }

  // RN-06: used by work orders to validate an assignment target.
  async assertActiveTechnician(id: string): Promise<void> {
    if (!(await this.repository.findActiveWithRole(id, UserRole.TECHNICIAN))) {
      throw new UnprocessableEntityException('RN-06: assignee must be an active technician');
    }
  }
}

function toResponse(user: UserRow): UserResponseDto {
  return { ...user, role: user.role as UserRole };
}

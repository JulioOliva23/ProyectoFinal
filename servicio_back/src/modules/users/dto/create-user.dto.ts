import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, Length, Matches, ValidateIf } from 'class-validator';
import { UserRole } from '../../../common/enums/user-role.enum';

export class CreateUserDto {
  @ApiProperty({ example: 'tecnico01' })
  @IsString()
  @Matches(/^[a-z0-9._-]{3,80}$/, { message: 'username must be 3-80 lowercase letters, digits, dot, dash or underscore' })
  username!: string;

  @ApiProperty({ minLength: 10, maxLength: 128 })
  @IsString()
  @Length(10, 128)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, { message: 'password must contain lowercase, uppercase and a digit' })
  password!: string;

  @ApiProperty({ example: 'Ana Pérez' })
  @IsString()
  @Length(3, 150)
  fullName!: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;

  // RN-14: required (and only allowed) for CUSTOMER accounts.
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((dto: CreateUserDto) => dto.role === UserRole.CUSTOMER || dto.customerId !== undefined)
  @IsUUID()
  customerId?: string;
}

export class QueryUsersDto {
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

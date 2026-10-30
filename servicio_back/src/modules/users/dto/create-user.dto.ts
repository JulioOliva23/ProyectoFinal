import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Length, Matches, ValidateIf } from 'class-validator';
import { UserRole } from '../../../common/enums/user-role.enum';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// Same rules for account creation and admin password resets.
function IsStrongPassword() {
  return applyDecorators(
    ApiProperty({ minLength: 10, maxLength: 128, description: 'Al menos una minúscula, una mayúscula y un dígito' }),
    IsString(),
    Length(10, 128),
    Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, { message: 'La contraseña debe incluir una minúscula, una mayúscula y un número' }),
  );
}

export class CreateUserDto {
  @ApiProperty({ example: 'tecnico01' })
  @IsString()
  @Matches(/^[a-z0-9._-]{3,80}$/, { message: 'El usuario debe tener de 3 a 80 caracteres: minúsculas, dígitos, punto, guion o guion bajo' })
  username!: string;

  @IsStrongPassword()
  password!: string;

  @ApiProperty({ example: 'Ana Pérez' })
  @Transform(trim)
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

// US-21: basic data an admin may edit. Username and customer binding are fixed.
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Ana Pérez' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(3, 150)
  fullName?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class ResetPasswordDto {
  @IsStrongPassword()
  password!: string;
}

export class QueryUsersDto {
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  // US-21: the admin screen also lists deactivated accounts. Ignored for
  // other roles, so reception keeps getting active technicians only.
  @ApiPropertyOptional({ default: false, description: 'Incluir usuarios desactivados (solo ADMIN)' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean;
}

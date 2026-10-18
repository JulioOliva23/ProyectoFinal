import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CustomerCheckInDto, DeviceCheckInDto } from '../../devices/dto/device-check-in.dto';
import { CosmeticCondition, LockType } from './work-order-enums';

// RN-01: cosmetic check-in snapshot, one condition per zone.
export class CosmeticCheckInDto {
  @ApiProperty({ enum: CosmeticCondition }) @IsEnum(CosmeticCondition) screen!: CosmeticCondition;
  @ApiProperty({ enum: CosmeticCondition }) @IsEnum(CosmeticCondition) backCover!: CosmeticCondition;
  @ApiProperty({ enum: CosmeticCondition }) @IsEnum(CosmeticCondition) frame!: CosmeticCondition;
  @ApiProperty({ enum: CosmeticCondition }) @IsEnum(CosmeticCondition) cameraLens!: CosmeticCondition;
  @ApiProperty({ enum: CosmeticCondition }) @IsEnum(CosmeticCondition) buttons!: CosmeticCondition;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  notes?: string;
}

// RN-03: format of the unlock code depends on the lock type.
const UNLOCK_CODE_FORMAT: Record<Exclude<LockType, LockType.NONE>, RegExp> = {
  [LockType.PIN]: /^\d{4,16}$/,
  // Android 3x3 grid nodes 1-9, 4 to 9 nodes, e.g. "1-5-9-6".
  [LockType.PATTERN]: /^[1-9](-[1-9]){3,8}$/,
  [LockType.PASSWORD]: /^[\s\S]{1,64}$/,
};

export function isUnlockCodeValid(lockType: LockType, unlockCode: string | undefined): boolean {
  if (lockType === LockType.NONE) return unlockCode === undefined;
  return unlockCode !== undefined && UNLOCK_CODE_FORMAT[lockType].test(unlockCode);
}

@ValidatorConstraint({ name: 'unlockCodeMatchesLockType' })
class UnlockCodeMatchesLockType implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const { lockType } = args.object as { lockType?: LockType };
    return typeof value === 'string' && lockType !== undefined && isUnlockCodeValid(lockType, value);
  }

  defaultMessage(): string {
    return 'RN-03: unlockCode does not match lockType (NONE: omit, PIN: 4-16 digits, PATTERN: e.g. 1-5-9-6, PASSWORD: 1-64 chars)';
  }
}

export class CreateWorkOrderDto {
  @ApiProperty({ type: CustomerCheckInDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CustomerCheckInDto)
  customer!: CustomerCheckInDto;

  // RN-02: the IMEI Luhn validation lives inside DeviceCheckInDto.
  @ApiProperty({ type: DeviceCheckInDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => DeviceCheckInDto)
  device!: DeviceCheckInDto;

  @ApiProperty({ example: 'Pantalla rota tras caída, no responde al tacto' })
  @IsString()
  @Length(5, 1000)
  reportedProblem!: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, description: 'Omitir si el equipo no enciende' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  batteryLevel?: number;

  @ApiProperty({ type: CosmeticCheckInDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CosmeticCheckInDto)
  cosmeticCheckIn!: CosmeticCheckInDto;

  @ApiProperty({ enum: LockType })
  @IsEnum(LockType)
  lockType!: LockType;

  @ApiPropertyOptional({ description: 'Obligatorio salvo lockType=NONE. Se cifra con AES-256-GCM (RN-03).' })
  @ValidateIf((dto: CreateWorkOrderDto) => dto.lockType !== LockType.NONE || dto.unlockCode !== undefined)
  @IsString()
  @Validate(UnlockCodeMatchesLockType)
  unlockCode?: string;

  @ApiPropertyOptional({ example: '2026-10-25T18:00:00Z', description: 'Fecha compromiso de entrega' })
  @IsOptional()
  @IsISO8601({ strict: true })
  promisedAt?: string;
}


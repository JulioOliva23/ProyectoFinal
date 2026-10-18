import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { normalizeImei } from '../../../domain/devices/imei';
import { IsImei } from '../validators/is-imei.validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// RN-01 / RN-02: device data captured at the front desk. The IMEI is
// normalized (spaces/dashes removed) and then Luhn-validated before any
// service code runs.
export class DeviceCheckInDto {
  @ApiProperty({ example: '35-209900-176148-1', description: '15 dígitos con dígito verificador Luhn válido' })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeImei(value) : value))
  @IsImei()
  imei!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  deviceModelId!: string;

  @ApiPropertyOptional({ example: 'Graphite' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  color?: string;
}

export class CustomerCheckInDto {
  @ApiProperty({ example: '8456123 LP' })
  @Transform(trim)
  @IsString()
  @Length(4, 50)
  identification!: string;

  @ApiProperty({ example: 'María Quispe' })
  @Transform(trim)
  @IsString()
  @Length(3, 150)
  name!: string;

  @ApiPropertyOptional({ example: '+59171234567' })
  @IsOptional()
  @Matches(/^\+?[0-9 ]{7,20}$/)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @Length(3, 150)
  email?: string;
}

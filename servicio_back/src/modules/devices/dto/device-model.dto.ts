import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateDeviceModelDto {
  @ApiProperty({ example: 'Apple' })
  @Transform(trim)
  @IsString()
  @Length(2, 60)
  brand!: string;

  @ApiProperty({ example: 'iPhone 13' })
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  model!: string;
}

export class DeviceModelResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() brand!: string;
  @ApiProperty() model!: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

// US-00 / BE-T00.3: login credentials validated with class-validator.
export class LoginDto {
  @ApiProperty({ description: 'Nombre de usuario o correo del usuario interno', example: 'recep01' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ description: 'Contraseña del usuario', example: 'Servicio2026!' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

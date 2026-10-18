import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

// US-00 / BE-27: the refresh token is sent in the request body and exchanged
// for a new token pair.
export class RefreshDto {
  @ApiProperty({ description: 'Refresh token (JWT) emitido en el login', example: 'eyJhbGciOi...' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

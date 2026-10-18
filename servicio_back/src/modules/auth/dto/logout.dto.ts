import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

// BE-E10 / US-00: the refresh token being signed out is sent in the request
// body so the server can revoke it in the denylist.
export class LogoutDto {
  @ApiProperty({ description: 'Refresh token (JWT) que se desea revocar', example: 'eyJhbGciOi...' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
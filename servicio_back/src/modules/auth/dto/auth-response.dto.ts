import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../../common/enums/user-role.enum';

// US-00 / BE-27: JWT token pair returned after a successful login. The user
// role drives the frontend navigation by role and the backend RBAC.
export class AuthResponseDto {
  @ApiProperty({ description: 'Access token (JWT)', example: 'eyJhbGciOi...' })
  accessToken!: string;

  @ApiProperty({ description: 'Refresh token (JWT)', example: 'eyJhbGciOi...' })
  refreshToken!: string;

  @ApiProperty({ description: 'Identificador del usuario autenticado', example: '00000000-0000-4000-8000-000000000010' })
  id!: string;

  @ApiProperty({ description: 'Nombre completo del usuario', example: 'Recepcionista Uno' })
  fullName!: string;

  @ApiProperty({ description: 'Nombre de usuario', example: 'recep01' })
  username!: string;

  @ApiProperty({ enum: UserRole, description: 'Rol del usuario autenticado', example: UserRole.RECEPTIONIST })
  role!: UserRole;
}

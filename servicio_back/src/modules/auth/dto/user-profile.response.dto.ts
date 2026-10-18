import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../../common/enums/user-role.enum';

// US-00: profile of the authenticated user, safe to expose to the frontend.
// Never includes the password hash (BE-28).
export class UserProfileResponseDto {
  @ApiProperty({ description: 'Identificador del usuario' })
  id!: string;

  @ApiProperty({ description: 'Nombre completo del usuario' })
  fullName!: string;

  @ApiProperty({ description: 'Nombre de usuario' })
  username!: string;

  @ApiProperty({ enum: UserRole, description: 'Rol del usuario' })
  role!: UserRole;

  @ApiProperty({ description: 'Indica si la cuenta está activa' })
  isActive!: boolean;
}

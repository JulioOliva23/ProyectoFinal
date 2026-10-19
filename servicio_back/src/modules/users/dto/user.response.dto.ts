import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../../common/enums/user-role.enum';

// BE-28: password hashes never leave the repository layer.
export class UserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ enum: UserRole }) role!: UserRole;
  @ApiProperty({ type: String, nullable: true  }) customerId!: string | null;
  @ApiProperty() isActive!: boolean;
}

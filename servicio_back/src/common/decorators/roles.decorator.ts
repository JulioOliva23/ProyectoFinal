import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';

export const ROLES_KEY = 'roles';

// BE-29: declares the roles allowed to access a route.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

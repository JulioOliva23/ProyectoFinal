import { UserRole } from '../enums/user-role.enum';

// BE-19: identity extracted from the access token. customerId is present only
// for CUSTOMER users (RN-14).
export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  customerId?: string;
}

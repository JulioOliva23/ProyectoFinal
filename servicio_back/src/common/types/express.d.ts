import 'express';
import { AuthenticatedUser } from './authenticated-user';

declare module 'express' {
  interface Request {
    user: AuthenticatedUser;
  }
}

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// BE-29: marks a route as publicly accessible, exempting it from the global
// JWT auth guard (RN-17 public client query).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

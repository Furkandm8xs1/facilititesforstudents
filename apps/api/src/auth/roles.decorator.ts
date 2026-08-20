import { SetMetadata } from '@nestjs/common';

export const REQUIRED_ROLES_KEY = 'requiredRoles';
export const ANY_REQUIRED_ROLES_KEY = 'anyRequiredRoles';
export const RequireRoles = (...roles: string[]) =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);
export const RequireAnyRole = (...roles: string[]) =>
  SetMetadata(ANY_REQUIRED_ROLES_KEY, roles);

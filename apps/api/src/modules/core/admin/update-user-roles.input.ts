import { BadRequestException } from '@nestjs/common';

import {
  ASSIGNABLE_USER_ROLES,
  type AssignableUserRole,
} from './create-user.input';

export function parseUpdateUserRolesInput(
  value: unknown,
): AssignableUserRole[] {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('roles' in value) ||
    !Array.isArray(value.roles)
  ) {
    throw new BadRequestException({
      message: 'Rol bilgileri geçerli değil.',
      errors: { roles: 'Roller bir liste olarak gönderilmelidir.' },
    });
  }

  const allowedRoles = new Set<string>(ASSIGNABLE_USER_ROLES);
  const hasUnknownRole = value.roles.some(
    (role) => typeof role !== 'string' || !allowedRoles.has(role),
  );

  if (hasUnknownRole) {
    throw new BadRequestException({
      message: 'Rol bilgileri geçerli değil.',
      errors: { roles: 'Bilinmeyen bir rol seçildi.' },
    });
  }

  return [...new Set(value.roles)] as AssignableUserRole[];
}

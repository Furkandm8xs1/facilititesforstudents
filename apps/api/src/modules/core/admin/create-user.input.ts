import { BadRequestException } from '@nestjs/common';

export const ASSIGNABLE_USER_ROLES = [
  'platform_admin',
  'canteen_manager',
  'canteen_operator',
  'kitchen_manager',
  'kitchen_operator',
  'laundry_manager',
  'laundry_operator',
  'tea_cafe_attendant',
  'wallet_cashier',
] as const;

export type AssignableUserRole = (typeof ASSIGNABLE_USER_ROLES)[number];

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  phoneE164: string;
  temporaryPassword: string;
  roles: AssignableUserRole[];
}

const phonePattern = /^\+[1-9][0-9]{7,14}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseCreateUserInput(value: unknown): CreateUserInput {
  if (!isRecord(value)) {
    throw new BadRequestException('Kullanıcı bilgileri gönderilmelidir.');
  }

  const firstName = text(value.firstName);
  const lastName = text(value.lastName);
  const phoneE164 = text(value.phoneE164).replaceAll(' ', '');
  const temporaryPassword =
    typeof value.temporaryPassword === 'string' ? value.temporaryPassword : '';
  const requestedRoles = Array.isArray(value.roles) ? value.roles : [];
  const allowedRoles = new Set<string>(ASSIGNABLE_USER_ROLES);
  const roles = [...new Set(requestedRoles)].filter(
    (role): role is AssignableUserRole =>
      typeof role === 'string' && allowedRoles.has(role),
  );
  const errors: Record<string, string> = {};

  if (!firstName || firstName.length > 80) {
    errors.firstName = 'Ad 1-80 karakter arasında olmalıdır.';
  }

  if (!lastName || lastName.length > 80) {
    errors.lastName = 'Soyad 1-80 karakter arasında olmalıdır.';
  }

  if (!phonePattern.test(phoneE164)) {
    errors.phoneE164 = 'Telefon +905551112233 biçiminde olmalıdır.';
  }

  if (temporaryPassword.length < 10 || temporaryPassword.length > 128) {
    errors.temporaryPassword =
      'Geçici parola 10-128 karakter arasında olmalıdır.';
  }

  if (
    requestedRoles.some(
      (role) => typeof role !== 'string' || !allowedRoles.has(role),
    )
  ) {
    errors.roles = 'Bilinmeyen bir rol seçildi.';
  }

  if (Object.keys(errors).length > 0) {
    throw new BadRequestException({
      message: 'Kullanıcı bilgileri geçerli değil.',
      errors,
    });
  }

  return { firstName, lastName, phoneE164, temporaryPassword, roles };
}

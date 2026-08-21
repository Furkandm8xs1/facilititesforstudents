import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { parseUpdateUserRolesInput } from './update-user-roles.input';

describe('parseUpdateUserRolesInput', () => {
  it('accepts an empty role list', () => {
    expect(parseUpdateUserRolesInput({ roles: [] })).toEqual([]);
  });

  it('removes duplicate assignable roles', () => {
    expect(
      parseUpdateUserRolesInput({
        roles: ['kitchen_operator', 'kitchen_operator', 'laundry_manager'],
      }),
    ).toEqual(['kitchen_operator', 'laundry_manager']);
  });

  it('rejects missing and unknown roles', () => {
    expect(() => parseUpdateUserRolesInput({})).toThrow(BadRequestException);
    expect(() => parseUpdateUserRolesInput({ roles: ['realm-admin'] })).toThrow(
      BadRequestException,
    );
  });
});

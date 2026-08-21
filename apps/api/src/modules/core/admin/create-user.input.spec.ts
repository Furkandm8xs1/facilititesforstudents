import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { parseCreateUserInput } from './create-user.input';

describe('parseCreateUserInput', () => {
  it('normalizes the phone and removes duplicate roles', () => {
    const input = parseCreateUserInput({
      firstName: ' Ayşe ',
      lastName: ' Yılmaz ',
      phoneE164: '+90 555 111 22 33',
      temporaryPassword: 'gecici-parola',
      roles: ['canteen_operator', 'canteen_operator'],
    });

    expect(input).toEqual({
      firstName: 'Ayşe',
      lastName: 'Yılmaz',
      phoneE164: '+905551112233',
      temporaryPassword: 'gecici-parola',
      roles: ['canteen_operator'],
    });
  });

  it('rejects unknown roles and short passwords', () => {
    expect(() =>
      parseCreateUserInput({
        firstName: 'Ayşe',
        lastName: 'Yılmaz',
        phoneE164: '+905551112233',
        temporaryPassword: 'kısa',
        roles: ['realm-admin'],
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts kitchen and laundry roles', () => {
    const input = parseCreateUserInput({
      firstName: 'Ayşe',
      lastName: 'Yılmaz',
      phoneE164: '+905551112233',
      temporaryPassword: 'gecici-parola',
      roles: [
        'kitchen_operator',
        'kitchen_manager',
        'laundry_operator',
        'laundry_manager',
      ],
    });

    expect(input.roles).toEqual([
      'kitchen_operator',
      'kitchen_manager',
      'laundry_operator',
      'laundry_manager',
    ]);
  });
});

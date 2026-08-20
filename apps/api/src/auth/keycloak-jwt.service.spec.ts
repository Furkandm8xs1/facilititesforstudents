import { describe, expect, it } from 'vitest';

import { authUserFromClaims } from './keycloak-jwt.service';

describe('authUserFromClaims', () => {
  it('reads identity, realm roles and portal API roles', () => {
    const user = authUserFromClaims({
      sub: '6d4b0b68-020a-48ba-ad50-54f7da55b04f',
      preferred_username: '+905551112233',
      realm_access: { roles: ['portal_user'] },
      resource_access: {
        'portal-api': { roles: ['canteen_operator', 'wallet_cashier'] },
      },
    });

    expect(user).toEqual({
      subject: '6d4b0b68-020a-48ba-ad50-54f7da55b04f',
      preferredUsername: '+905551112233',
      realmRoles: ['portal_user'],
      clientRoles: ['canteen_operator', 'wallet_cashier'],
    });
  });
});

import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { UserProfileRepository } from '../user-profile.repository';
import type { KeycloakAdminService } from './keycloak-admin.service';
import { UserProvisioningService } from './user-provisioning.service';

const input = {
  firstName: 'Sistem',
  lastName: 'Yöneticisi',
  phoneE164: '+905550000000',
  temporaryPassword: 'Hizmet-Test-2026!',
  roles: [
    'platform_admin',
    'canteen_manager',
    'canteen_operator',
    'wallet_cashier',
  ],
};

describe('UserProvisioningService', () => {
  it('creates the identity before the application profile', async () => {
    const keycloak = {
      createUser: vi.fn().mockResolvedValue('keycloak-user-id'),
      deleteUser: vi.fn(),
    };
    const userProfiles = {
      create: vi.fn().mockResolvedValue({ id: 'profile-id' }),
    };
    const service = new UserProvisioningService(
      keycloak as unknown as KeycloakAdminService,
      userProfiles as unknown as UserProfileRepository,
    );

    const result = await service.create(input);

    expect(keycloak.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ phoneE164: '+905550000000' }),
      ['portal_user', 'platform_admin'],
      input.roles,
    );
    expect(userProfiles.create).toHaveBeenCalledWith(
      'keycloak-user-id',
      expect.objectContaining({ firstName: 'Sistem' }),
    );
    expect(result.mustChangePassword).toBe(true);
  });

  it('removes the new Keycloak user when PostgreSQL rejects it', async () => {
    const keycloak = {
      createUser: vi.fn().mockResolvedValue('keycloak-user-id'),
      deleteUser: vi.fn().mockResolvedValue(undefined),
    };
    const userProfiles = {
      create: vi.fn().mockRejectedValue({ code: '23505' }),
    };
    const service = new UserProvisioningService(
      keycloak as unknown as KeycloakAdminService,
      userProfiles as unknown as UserProfileRepository,
    );

    await expect(service.create(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(keycloak.deleteUser).toHaveBeenCalledWith('keycloak-user-id');
  });
});

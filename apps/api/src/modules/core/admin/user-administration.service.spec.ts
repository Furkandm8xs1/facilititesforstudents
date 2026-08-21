import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  KeycloakAdminError,
  type KeycloakAdminService,
  type KeycloakUserAdministrationDetails,
} from './keycloak-admin.service';
import { UserAdministrationService } from './user-administration.service';

const keycloakUser: KeycloakUserAdministrationDetails = {
  id: 'bd8b50a3-b7bd-41cb-bfdd-0d1ea4d685b2',
  username: '+905416947430',
  firstName: 'Yunus Baran',
  lastName: 'Yeler',
  enabled: true,
  roles: ['portal_user'],
  initialPasswordChanged: true,
};

function buildService() {
  const keycloak = {
    listUserAdministrationDetails: vi.fn().mockResolvedValue([keycloakUser]),
    replaceUserApplicationRoles: vi.fn().mockResolvedValue({
      ...keycloakUser,
      roles: ['portal_user', 'platform_admin', 'kitchen_manager'],
    }),
  };
  const service = new UserAdministrationService(
    keycloak as unknown as KeycloakAdminService,
  );

  return { keycloak, service };
}

describe('UserAdministrationService', () => {
  it('lists password-changed Keycloak users without requiring a profile', async () => {
    const { keycloak, service } = buildService();

    await expect(service.list()).resolves.toEqual([
      {
        id: keycloakUser.id,
        keycloakSubject: keycloakUser.id,
        phoneE164: '+905416947430',
        firstName: 'Yunus Baran',
        lastName: 'Yeler',
        status: 'ACTIVE',
        roles: ['portal_user'],
      },
    ]);
    expect(keycloak.listUserAdministrationDetails).toHaveBeenCalledOnce();
  });

  it('hides users who have not changed their initial password', async () => {
    const { keycloak, service } = buildService();
    keycloak.listUserAdministrationDetails.mockResolvedValue([
      { ...keycloakUser, initialPasswordChanged: false },
    ]);

    await expect(service.list()).resolves.toEqual([]);
  });

  it('reports a gateway error when the Keycloak user list cannot be read', async () => {
    const { keycloak, service } = buildService();
    keycloak.listUserAdministrationDetails.mockRejectedValue(
      new KeycloakAdminError(503, 'Unavailable'),
    );

    await expect(service.list()).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('updates assignable roles directly on the Keycloak user', async () => {
    const { keycloak, service } = buildService();

    await expect(
      service.updateRoles(keycloakUser.id, 'another-user', {
        roles: ['platform_admin', 'kitchen_manager'],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: keycloakUser.id,
        roles: ['portal_user', 'platform_admin', 'kitchen_manager'],
      }),
    );
    expect(keycloak.replaceUserApplicationRoles).toHaveBeenCalledWith(
      keycloakUser.id,
      ['platform_admin', 'kitchen_manager'],
    );
  });

  it('does not let an administrator remove their own admin role', async () => {
    const { keycloak, service } = buildService();

    await expect(
      service.updateRoles(keycloakUser.id, keycloakUser.id, {
        roles: ['kitchen_manager'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(keycloak.replaceUserApplicationRoles).not.toHaveBeenCalled();
  });

  it('returns not found when the Keycloak user no longer exists', async () => {
    const { keycloak, service } = buildService();
    keycloak.replaceUserApplicationRoles.mockRejectedValue(
      new KeycloakAdminError(404, 'User not found'),
    );

    await expect(
      service.updateRoles(keycloakUser.id, 'another-user', { roles: [] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

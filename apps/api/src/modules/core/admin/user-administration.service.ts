import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  KeycloakAdminError,
  KeycloakAdminService,
  type KeycloakUserAdministrationDetails,
} from './keycloak-admin.service';
import { parseUpdateUserRolesInput } from './update-user-roles.input';

export interface AdminUserSummary {
  id: string;
  keycloakSubject: string;
  phoneE164: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'SUSPENDED';
  roles: string[];
}

@Injectable()
export class UserAdministrationService {
  private readonly logger = new Logger(UserAdministrationService.name);

  constructor(private readonly keycloak: KeycloakAdminService) {}

  async list(): Promise<AdminUserSummary[]> {
    try {
      const users = await this.keycloak.listUserAdministrationDetails();

      return users
        .filter((user) => user.initialPasswordChanged)
        .map((user) => this.toSummary(user));
    } catch (error) {
      this.logger.error(
        'Kullanıcılar Keycloak üzerinden okunamadı.',
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadGatewayException('Kullanıcı listesi okunamadı.');
    }
  }

  async updateRoles(
    keycloakUserId: string,
    actorSubject: string,
    rawInput: unknown,
  ): Promise<AdminUserSummary> {
    const roles = parseUpdateUserRolesInput(rawInput);

    if (keycloakUserId === actorSubject && !roles.includes('platform_admin')) {
      throw new BadRequestException(
        'Kendi platform yöneticisi rolünüzü kaldıramazsınız.',
      );
    }

    try {
      const user = await this.keycloak.replaceUserApplicationRoles(
        keycloakUserId,
        roles,
      );
      return this.toSummary(user);
    } catch (error) {
      if (error instanceof KeycloakAdminError && error.status === 404) {
        throw new NotFoundException('Kullanıcı Keycloak üzerinde bulunamadı.');
      }

      this.logger.error(
        `Kullanıcı rolleri Keycloak üzerinde güncellenemedi: ${keycloakUserId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadGatewayException('Kullanıcı rolleri güncellenemedi.');
    }
  }

  private toSummary(user: KeycloakUserAdministrationDetails): AdminUserSummary {
    return {
      id: user.id,
      keycloakSubject: user.id,
      phoneE164: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.enabled ? 'ACTIVE' : 'SUSPENDED',
      roles: user.roles,
    };
  }
}

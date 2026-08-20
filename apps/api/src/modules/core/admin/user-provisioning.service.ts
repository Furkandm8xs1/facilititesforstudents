import {
  BadGatewayException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import { UserProfileRepository } from '../user-profile.repository';
import { parseCreateUserInput } from './create-user.input';
import {
  KeycloakAdminError,
  KeycloakAdminService,
} from './keycloak-admin.service';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

@Injectable()
export class UserProvisioningService {
  private readonly logger = new Logger(UserProvisioningService.name);

  constructor(
    private readonly keycloak: KeycloakAdminService,
    private readonly userProfiles: UserProfileRepository,
  ) {}

  async create(rawInput: unknown) {
    const input = parseCreateUserInput(rawInput);
    const realmRoles = [
      'portal_user',
      ...(input.roles.includes('platform_admin') ? ['platform_admin'] : []),
    ];
    let keycloakSubject: string;

    try {
      keycloakSubject = await this.keycloak.createUser(
        input,
        realmRoles,
        input.roles,
      );
    } catch (error) {
      if (error instanceof KeycloakAdminError && error.status === 409) {
        throw new ConflictException(error.message);
      }

      this.logger.error(
        'Keycloak kullanıcı oluşturma işlemi başarısız oldu.',
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadGatewayException(
        'Kimlik sunucusunda kullanıcı oluşturulamadı.',
      );
    }

    try {
      const profile = await this.userProfiles.create(keycloakSubject, input);
      return {
        profile,
        roles: realmRoles.concat(
          input.roles.filter((role) => role !== 'platform_admin'),
        ),
        mustChangePassword: true,
      };
    } catch (error) {
      try {
        await this.keycloak.deleteUser(keycloakSubject);
      } catch (cleanupError) {
        this.logger.error(
          `PostgreSQL kaydı başarısız olan Keycloak kullanıcısı temizlenemedi: ${keycloakSubject}`,
          cleanupError instanceof Error ? cleanupError.stack : undefined,
        );
        throw new InternalServerErrorException(
          'Kullanıcı kaydı yarım kaldı; sistem yöneticisi müdahalesi gerekiyor.',
        );
      }

      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Bu telefon numarasıyla bir kullanıcı zaten var.',
        );
      }

      this.logger.error(
        'Kullanıcı profili PostgreSQL veritabanına kaydedilemedi.',
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Kullanıcı profili kaydedilemedi.',
      );
    }
  }
}

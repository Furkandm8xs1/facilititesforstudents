import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ASSIGNABLE_USER_ROLES,
  type AssignableUserRole,
  type CreateUserInput,
} from './create-user.input';

interface KeycloakRole {
  id: string;
  name: string;
}

interface KeycloakUserRepresentation {
  id?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  requiredActions?: string[];
  serviceAccountClientId?: string;
}

export interface KeycloakUserAdministrationDetails {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  roles: string[];
  initialPasswordChanged: boolean;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

const managedRealmRoles = new Set(['portal_user', 'platform_admin']);
const managedClientRoles = new Set<string>(
  ASSIGNABLE_USER_ROLES.filter((role) => role !== 'platform_admin'),
);

export class KeycloakAdminError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'KeycloakAdminError';
  }
}

@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private readonly baseUrl: string;
  private readonly realm: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly portalApiClientUuid: string;
  private accessToken?: string;
  private accessTokenExpiresAt = 0;
  private accessTokenRequest?: Promise<string>;

  constructor(config: ConfigService) {
    const issuer = config.get<string>('KEYCLOAK_ISSUER') ?? '';
    this.clientId = config.get<string>('KEYCLOAK_ADMIN_CLIENT_ID') ?? '';
    this.clientSecret =
      config.get<string>('KEYCLOAK_ADMIN_CLIENT_SECRET') ?? '';
    this.portalApiClientUuid =
      config.get<string>('KEYCLOAK_PORTAL_API_CLIENT_UUID') ?? '';
    const issuerMatch = new URL(issuer).pathname.match(
      /^(.*)\/realms\/([^/]+)$/,
    );

    if (
      !issuerMatch ||
      !this.clientId ||
      !this.clientSecret ||
      !this.portalApiClientUuid
    ) {
      throw new Error('Keycloak yönetim servisi ayarları eksik.');
    }

    const issuerUrl = new URL(issuer);
    this.baseUrl = `${issuerUrl.origin}${issuerMatch[1]}`;
    this.realm = decodeURIComponent(issuerMatch[2]);
  }

  async createUser(
    input: CreateUserInput,
    realmRoles: string[],
    clientRoles: AssignableUserRole[],
  ): Promise<string> {
    let userId: string | undefined;

    try {
      const response = await this.adminRequest('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: input.phoneE164,
          firstName: input.firstName,
          lastName: input.lastName,
          enabled: true,
          credentials: [
            {
              type: 'password',
              value: input.temporaryPassword,
              temporary: true,
            },
          ],
          requiredActions: ['UPDATE_PASSWORD'],
        }),
      });

      if (response.status === 409) {
        throw new KeycloakAdminError(
          409,
          'Bu telefon numarasıyla bir hesap zaten var.',
        );
      }

      if (response.status !== 201) {
        throw await this.responseError(response, 'Kullanıcı oluşturulamadı.');
      }

      userId = this.userIdFromLocation(response.headers.get('location'));
      await this.assignRealmRoles(userId, realmRoles);
      await this.assignClientRoles(userId, clientRoles);
      return userId;
    } catch (error) {
      if (userId) {
        try {
          await this.deleteUser(userId);
        } catch (cleanupError) {
          this.logger.error(
            `Rol ataması başarısız olan Keycloak kullanıcısı temizlenemedi: ${userId}`,
            cleanupError instanceof Error ? cleanupError.stack : undefined,
          );
        }
      }

      throw error;
    }
  }

  async deleteUser(userId: string): Promise<void> {
    const response = await this.adminRequest(
      `/users/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    );

    if (response.status !== 204 && response.status !== 404) {
      throw await this.responseError(response, 'Kullanıcı temizlenemedi.');
    }
  }

  async getUserAdministrationDetails(
    userId: string,
  ): Promise<KeycloakUserAdministrationDetails> {
    const encodedUserId = encodeURIComponent(userId);
    const [user, roles] = await Promise.all([
      this.getJson<KeycloakUserRepresentation>(`/users/${encodedUserId}`),
      this.getUserApplicationRoles(userId),
    ]);

    return this.toAdministrationDetails(user, roles);
  }

  async listUserAdministrationDetails(): Promise<
    KeycloakUserAdministrationDetails[]
  > {
    const users = (await this.listUsers()).filter((user) =>
      this.isManageableUser(user),
    );

    return Promise.all(
      users.map(async (user) =>
        this.toAdministrationDetails(
          user,
          await this.getUserApplicationRoles(user.id),
        ),
      ),
    );
  }

  async replaceUserApplicationRoles(
    userId: string,
    roles: AssignableUserRole[],
  ): Promise<KeycloakUserAdministrationDetails> {
    const encodedUserId = encodeURIComponent(userId);
    const [user, realmRoles, clientRoles] = await Promise.all([
      this.getJson<KeycloakUserRepresentation>(`/users/${encodedUserId}`),
      this.getJson<KeycloakRole[]>(
        `/users/${encodedUserId}/role-mappings/realm`,
      ),
      this.getJson<KeycloakRole[]>(
        `/users/${encodedUserId}/role-mappings/clients/${this.portalApiClientUuid}`,
      ),
    ]);
    const desiredRealmRoles = new Set([
      'portal_user',
      ...(roles.includes('platform_admin') ? ['platform_admin'] : []),
    ]);
    const desiredClientRoles = roles.filter(
      (role) => role !== 'platform_admin',
    );
    const desiredClientRoleNames = new Set<string>(desiredClientRoles);
    const currentRealmRoles = realmRoles.filter((role) =>
      managedRealmRoles.has(role.name),
    );
    const currentClientRoles = clientRoles.filter((role) =>
      managedClientRoles.has(role.name),
    );
    const currentRealmNames = new Set(
      currentRealmRoles.map((role) => role.name),
    );
    const currentClientNames = new Set(
      currentClientRoles.map((role) => role.name),
    );
    const realmRolesToAdd = [...desiredRealmRoles].filter(
      (role) => !currentRealmNames.has(role),
    );
    const clientRolesToAdd = desiredClientRoles.filter(
      (role) => !currentClientNames.has(role),
    );
    const realmRolesToRemove = currentRealmRoles.filter(
      (role) => !desiredRealmRoles.has(role.name),
    );
    const clientRolesToRemove = currentClientRoles.filter(
      (role) => !desiredClientRoleNames.has(role.name),
    );

    await Promise.all([
      this.assignRealmRoles(userId, realmRolesToAdd),
      this.assignClientRoles(userId, clientRolesToAdd),
    ]);
    await Promise.all([
      this.removeRealmRoles(userId, realmRolesToRemove),
      this.removeClientRoles(userId, clientRolesToRemove),
    ]);

    return this.toAdministrationDetails(user, ['portal_user', ...roles]);
  }

  private async assignRealmRoles(
    userId: string,
    roleNames: string[],
  ): Promise<void> {
    if (roleNames.length === 0) {
      return;
    }

    const available = await this.getJson<KeycloakRole[]>(
      `/users/${encodeURIComponent(userId)}/role-mappings/realm/available`,
    );
    const selected = this.selectRoles(available, roleNames);
    const response = await this.adminRequest(
      `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selected),
      },
    );

    if (response.status !== 204) {
      throw await this.responseError(response, 'Realm rolleri atanamadı.');
    }
  }

  private async assignClientRoles(
    userId: string,
    roleNames: AssignableUserRole[],
  ): Promise<void> {
    const applicationRoles = roleNames.filter(
      (role) => role !== 'platform_admin',
    );

    if (applicationRoles.length === 0) {
      return;
    }

    const clientUuid = this.portalApiClientUuid;
    const available = await this.getJson<KeycloakRole[]>(
      `/users/${encodeURIComponent(userId)}/role-mappings/clients/${clientUuid}/available`,
    );
    const selected = this.selectRoles(available, applicationRoles);
    const response = await this.adminRequest(
      `/users/${encodeURIComponent(userId)}/role-mappings/clients/${clientUuid}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selected),
      },
    );

    if (response.status !== 204) {
      throw await this.responseError(response, 'Servis rolleri atanamadı.');
    }
  }

  private async removeRealmRoles(
    userId: string,
    roles: KeycloakRole[],
  ): Promise<void> {
    await this.removeRoleMappings(
      `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
      roles,
      'Realm rolleri kaldırılamadı.',
    );
  }

  private async removeClientRoles(
    userId: string,
    roles: KeycloakRole[],
  ): Promise<void> {
    await this.removeRoleMappings(
      `/users/${encodeURIComponent(userId)}/role-mappings/clients/${this.portalApiClientUuid}`,
      roles,
      'Servis rolleri kaldırılamadı.',
    );
  }

  private async removeRoleMappings(
    path: string,
    roles: KeycloakRole[],
    errorMessage: string,
  ): Promise<void> {
    if (roles.length === 0) {
      return;
    }

    const response = await this.adminRequest(path, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roles),
    });

    if (response.status !== 204) {
      throw await this.responseError(response, errorMessage);
    }
  }

  private async getUserApplicationRoles(userId: string): Promise<string[]> {
    const encodedUserId = encodeURIComponent(userId);
    const [realmRoles, clientRoles] = await Promise.all([
      this.getJson<KeycloakRole[]>(
        `/users/${encodedUserId}/role-mappings/realm`,
      ),
      this.getJson<KeycloakRole[]>(
        `/users/${encodedUserId}/role-mappings/clients/${this.portalApiClientUuid}`,
      ),
    ]);
    const assigned = new Set(
      [...realmRoles, ...clientRoles].map((role) => role.name),
    );

    return ['portal_user', ...ASSIGNABLE_USER_ROLES].filter((role) =>
      assigned.has(role),
    );
  }

  private async listUsers(): Promise<KeycloakUserRepresentation[]> {
    const users: KeycloakUserRepresentation[] = [];
    const pageSize = 100;
    let first = 0;
    let page: KeycloakUserRepresentation[];

    do {
      page = await this.getJson<KeycloakUserRepresentation[]>(
        `/users?first=${first}&max=${pageSize}`,
      );
      users.push(...page);
      first += page.length;
    } while (page.length === pageSize);

    return users;
  }

  private isManageableUser(
    user: KeycloakUserRepresentation,
  ): user is KeycloakUserRepresentation & { id: string; username: string } {
    return Boolean(user.id && user.username && !user.serviceAccountClientId);
  }

  private toAdministrationDetails(
    user: KeycloakUserRepresentation,
    roles: string[],
  ): KeycloakUserAdministrationDetails {
    if (!user.id || !user.username) {
      throw new KeycloakAdminError(
        502,
        'Keycloak kullanıcı kimliği veya kullanıcı adı döndürmedi.',
      );
    }

    return {
      id: user.id,
      username: user.username,
      firstName: user.firstName?.trim() || user.username,
      lastName: user.lastName?.trim() || '',
      enabled: user.enabled !== false,
      roles,
      initialPasswordChanged:
        !user.requiredActions?.includes('UPDATE_PASSWORD'),
    };
  }

  private selectRoles(
    available: KeycloakRole[],
    roleNames: readonly string[],
  ): KeycloakRole[] {
    const requested = new Set(roleNames);
    const selected = available.filter((role) => requested.has(role.name));

    if (selected.length !== requested.size) {
      const found = new Set(selected.map((role) => role.name));
      const missing = [...requested].filter((role) => !found.has(role));
      throw new KeycloakAdminError(
        500,
        `Keycloak rolleri bulunamadı: ${missing.join(', ')}`,
      );
    }

    return selected;
  }

  private async getJson<Result>(path: string): Promise<Result> {
    const response = await this.adminRequest(path);

    if (!response.ok) {
      throw await this.responseError(response, 'Keycloak bilgisi okunamadı.');
    }

    return (await response.json()) as Result;
  }

  private async adminRequest(
    path: string,
    init: RequestInit = {},
    retry = true,
  ): Promise<Response> {
    const token = await this.getAccessToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(
      `${this.baseUrl}/admin/realms/${encodeURIComponent(this.realm)}${path}`,
      { ...init, headers },
    );

    if (response.status === 401 && retry) {
      this.accessToken = undefined;
      this.accessTokenExpiresAt = 0;
      this.accessTokenRequest = undefined;
      return this.adminRequest(path, init, false);
    }

    return response;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 30_000) {
      return this.accessToken;
    }

    if (!this.accessTokenRequest) {
      this.accessTokenRequest = this.requestAccessToken();
    }

    try {
      return await this.accessTokenRequest;
    } finally {
      this.accessTokenRequest = undefined;
    }
  }

  private async requestAccessToken(): Promise<string> {
    const response = await fetch(
      `${this.baseUrl}/realms/${encodeURIComponent(this.realm)}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
      },
    );

    if (!response.ok) {
      throw await this.responseError(
        response,
        'Keycloak yönetim belirteci alınamadı.',
      );
    }

    const token = (await response.json()) as TokenResponse;

    if (!token.access_token) {
      throw new KeycloakAdminError(
        502,
        'Keycloak geçerli bir yönetim belirteci döndürmedi.',
      );
    }

    this.accessToken = token.access_token;
    this.accessTokenExpiresAt = Date.now() + (token.expires_in ?? 300) * 1000;
    return this.accessToken;
  }

  private userIdFromLocation(location: string | null): string {
    const userId = location?.split('/').filter(Boolean).at(-1);

    if (!userId) {
      throw new KeycloakAdminError(
        502,
        'Keycloak yeni kullanıcı kimliğini döndürmedi.',
      );
    }

    return userId;
  }

  private async responseError(
    response: Response,
    fallback: string,
  ): Promise<KeycloakAdminError> {
    const detail = (await response.text()).slice(0, 500);
    return new KeycloakAdminError(
      response.status,
      detail ? `${fallback} ${detail}` : fallback,
    );
  }
}

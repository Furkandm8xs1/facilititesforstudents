import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AssignableUserRole, CreateUserInput } from './create-user.input';

interface KeycloakRole {
  id: string;
  name: string;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

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

  private async assignRealmRoles(
    userId: string,
    roleNames: string[],
  ): Promise<void> {
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
      return this.adminRequest(path, init, false);
    }

    return response;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 30_000) {
      return this.accessToken;
    }

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

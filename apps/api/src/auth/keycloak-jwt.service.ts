import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { createRemoteJWKSet } from 'jose';

import type { AuthUser } from './auth-user';

type RemoteJwkSet = ReturnType<typeof createRemoteJWKSet>;

function readRoles(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || !('roles' in value)) {
    return [];
  }

  const roles = value.roles;
  return Array.isArray(roles)
    ? roles.filter((role): role is string => typeof role === 'string')
    : [];
}

export function authUserFromClaims(claims: Record<string, unknown>): AuthUser {
  if (typeof claims.sub !== 'string') {
    throw new Error('Token içinde sub alanı bulunamadı.');
  }

  const resourceAccess =
    typeof claims.resource_access === 'object' &&
    claims.resource_access !== null
      ? claims.resource_access
      : {};
  const portalApiAccess =
    'portal-api' in resourceAccess ? resourceAccess['portal-api'] : undefined;

  return {
    subject: claims.sub,
    preferredUsername:
      typeof claims.preferred_username === 'string'
        ? claims.preferred_username
        : undefined,
    realmRoles: readRoles(claims.realm_access),
    clientRoles: readRoles(portalApiAccess),
  };
}

@Injectable()
export class KeycloakJwtService {
  private readonly issuer: string;
  private readonly audience: string;
  private jwks?: RemoteJwkSet;

  constructor(config: ConfigService) {
    this.issuer = config.get<string>('KEYCLOAK_ISSUER') ?? '';
    this.audience = config.get<string>('KEYCLOAK_AUDIENCE') ?? '';

    if (!this.issuer || !this.audience) {
      throw new Error('KEYCLOAK_ISSUER ve KEYCLOAK_AUDIENCE tanımlanmalıdır.');
    }
  }

  async verify(accessToken: string): Promise<AuthUser> {
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    this.jwks ??= createRemoteJWKSet(
      new URL(`${this.issuer}/protocol/openid-connect/certs`),
    );

    const { payload } = await jwtVerify(accessToken, this.jwks, {
      issuer: this.issuer,
      audience: this.audience,
      algorithms: ['RS256'],
    });

    return authUserFromClaims(payload);
  }
}

import { decodeJwt } from 'jose';
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Keycloak from 'next-auth/providers/keycloak';
import type { JWT } from 'next-auth/jwt';

const keycloakIssuer = process.env.AUTH_KEYCLOAK_ISSUER!;
const keycloakClientId = process.env.AUTH_KEYCLOAK_ID!;
const keycloakClientSecret = process.env.AUTH_KEYCLOAK_SECRET!;
const applicationRoles = new Set([
  'portal_user',
  'platform_admin',
  'canteen_manager',
  'canteen_operator',
  'kitchen_manager',
  'kitchen_operator',
  'laundry_manager',
  'laundry_operator',
  'wallet_cashier',
]);

function filterApplicationRoles(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value.filter(
        (role): role is string =>
          typeof role === 'string' && applicationRoles.has(role),
      ),
    ),
  ];
}

function rolesFromAccessToken(accessToken: string): string[] {
  try {
    const claims = decodeJwt(accessToken);
    const realmRoles = claims.realm_access as { roles?: unknown } | undefined;
    const resourceAccess = claims.resource_access as
      Record<string, { roles?: unknown }> | undefined;
    const portalApiRoles = resourceAccess?.['portal-api']?.roles;
    const roles = [
      ...(Array.isArray(realmRoles?.roles) ? realmRoles.roles : []),
      ...(Array.isArray(portalApiRoles) ? portalApiRoles : []),
    ];

    return filterApplicationRoles(roles);
  } catch {
    return [];
  }
}

function accessTokenHasSubject(accessToken: unknown): boolean {
  if (typeof accessToken !== 'string') {
    return false;
  }

  try {
    return typeof decodeJwt(accessToken).sub === 'string';
  } catch {
    return false;
  }
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  const refreshToken =
    typeof token.refreshToken === 'string' ? token.refreshToken : undefined;

  if (!refreshToken) {
    return { ...token, authError: 'RefreshTokenError' as const };
  }

  try {
    const response = await fetch(
      `${keycloakIssuer}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: keycloakClientId,
          client_secret: keycloakClientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      },
    );
    const refreshed = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    };

    if (!response.ok || !refreshed.access_token) {
      throw new Error('Keycloak erişim belirtecini yenilemedi.');
    }

    return {
      ...token,
      accessToken: refreshed.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + (refreshed.expires_in ?? 300),
      refreshToken: refreshed.refresh_token ?? refreshToken,
      roles: rolesFromAccessToken(refreshed.access_token),
      authError: undefined,
    };
  } catch {
    return { ...token, authError: 'RefreshTokenError' as const };
  }
}

async function endKeycloakSession(refreshToken: unknown): Promise<void> {
  if (typeof refreshToken !== 'string') {
    return;
  }

  const response = await fetch(
    `${keycloakIssuer}/protocol/openid-connect/logout`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: keycloakClientId,
        client_secret: keycloakClientSecret,
        refresh_token: refreshToken,
      }),
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error(`Keycloak oturumu kapatılamadı: HTTP ${response.status}`);
  }
}

const config = {
  providers: [
    Keycloak({
      clientId: keycloakClientId,
      clientSecret: keycloakClientSecret,
      issuer: keycloakIssuer,
      authorization: { params: { scope: 'openid' } },
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,
  },
  events: {
    async signOut(message) {
      const token = 'token' in message ? message.token : null;

      try {
        await endKeycloakSession(token?.refreshToken);
      } catch (error) {
        console.error(
          'Keycloak SSO oturumu kapatılamadı; yerel oturum kapatılmaya devam ediyor.',
          error instanceof Error ? error.message : undefined,
        );
      }
    },
  },
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at ?? Math.floor(Date.now() / 1000) + 300,
          roles: rolesFromAccessToken(account.access_token),
          authError: undefined,
        };
      }

      const expiresAt =
        typeof token.expiresAt === 'number' ? token.expiresAt : undefined;

      if (
        expiresAt &&
        Date.now() < expiresAt * 1000 - 30_000 &&
        accessTokenHasSubject(token.accessToken)
      ) {
        return token;
      }

      return refreshAccessToken(token);
    },
    session({ session, token }) {
      session.user.id = token.sub ?? '';
      session.user.roles = filterApplicationRoles(token.roles);
      session.apiAccessToken =
        typeof token.accessToken === 'string' ? token.accessToken : undefined;
      session.authError =
        token.authError === 'RefreshTokenError'
          ? 'RefreshTokenError'
          : undefined;
      return session;
    },
    authorized({ auth, request }) {
      const pathname = request.nextUrl.pathname;
      return pathname === '/login' || Boolean(auth?.user);
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;

export const { handlers, signIn, signOut, auth } = NextAuth(config);

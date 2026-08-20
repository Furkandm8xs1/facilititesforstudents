# Web Authentication and Session Lifecycle

[`auth.ts`](./auth.ts) configures NextAuth with Keycloak OpenID Connect. The web
application uses a JWT session, not a database-backed NextAuth session.

## Initial login

1. A protected route is requested without a session.
2. The `authorized` callback rejects the request unless it is `/login`.
3. The login page invokes NextAuth sign-in with the Keycloak provider.
4. Keycloak authenticates the user's phone-number username and password.
5. The OAuth callback supplies access token, refresh token, expiry, and subject
   to the NextAuth `jwt` callback.
6. Realm roles and `portal-api` client roles are extracted from the access
   token.
7. Only roles in the explicit application-role allowlist are kept.
8. The encrypted NextAuth JWT stores token material and normalized roles.

## Access-token refresh

On each session read, the `jwt` callback checks whether the access token remains
valid for at least another 30 seconds.

If refresh is needed:

1. Read the stored refresh token.
2. POST `grant_type=refresh_token` to the Keycloak token endpoint.
3. Replace access token, expiry, and optionally refresh token.
4. Re-read roles from the new access token.
5. Set `authError=RefreshTokenError` when refresh fails.

The session callback exposes:

- `session.user.id`: Keycloak subject;
- `session.user.roles`: filtered application roles;
- `session.apiAccessToken`: Bearer token used only by server code;
- `session.authError`: refresh failure indicator displayed by the portal.

## Route protection

[`proxy.ts`](./proxy.ts) applies NextAuth to every application route except the
NextAuth API, Next.js static/image assets, and favicon. Individual pages still
call `auth()` and perform role checks because page code must remain safe when
invoked through direct navigation.

## Type augmentation

[`types/next-auth.d.ts`](./types/next-auth.d.ts) extends NextAuth's TypeScript
types for the fields described above. Update that file whenever session or JWT
shape changes.

## Security rules

- Decoding the token in the web app is used only to select UI capabilities.
- The API independently verifies signature, issuer, audience, and roles.
- Do not place the access or refresh token in client component props, HTML,
  local storage, or browser-readable logs.
- Do not trust roles submitted in form data.
- A server action must call `auth()` for every mutation.

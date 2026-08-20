export interface CurrentUserResponse {
  identity: {
    subject: string;
    preferredUsername?: string;
    realmRoles: string[];
    clientRoles: string[];
  };
  profile: {
    id: string;
    phone_e164: string;
    first_name: string;
    last_name: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'DEPARTED';
  } | null;
}

export interface CreateUserPayload {
  firstName: string;
  lastName: string;
  phoneE164: string;
  temporaryPassword: string;
  roles: string[];
}

export interface CreateUserResult {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
}

export async function getCurrentUser(
  accessToken: string,
): Promise<CurrentUserResponse | null> {
  const response = await fetch(`${process.env.API_BASE_URL}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    console.error(`GET /me başarısız: HTTP ${response.status}`);
    return null;
  }

  return (await response.json()) as CurrentUserResponse;
}

export async function createUser(
  accessToken: string,
  payload: CreateUserPayload,
): Promise<CreateUserResult> {
  const response = await fetch(`${process.env.API_BASE_URL}/admin/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
    errors?: Record<string, string>;
  };

  if (!response.ok) {
    return {
      ok: false,
      message:
        typeof body.message === 'string'
          ? body.message
          : 'Kullanıcı oluşturulamadı.',
      errors: body.errors,
    };
  }

  return { ok: true, message: 'Kullanıcı başarıyla oluşturuldu.' };
}

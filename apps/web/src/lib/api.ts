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

export async function getCurrentUser(
  accessToken: string,
): Promise<CurrentUserResponse | null> {
  const response = await fetch(`${process.env.API_BASE_URL}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as CurrentUserResponse;
}

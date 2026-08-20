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

export interface WalletAccount {
  accountId: string;
  userProfileId: string;
  phoneE164: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEPARTED';
  currency: 'TRY';
  availableMinor: string;
  heldMinor: string;
}

export type WalletEntryType =
  | 'CASH_DEPOSIT'
  | 'CASH_DEPOSIT_REVERSAL'
  | 'HOLD'
  | 'CAPTURE'
  | 'RELEASE'
  | 'SERVICE_REFUND';

export interface WalletEntry {
  id: string;
  entryType: WalletEntryType;
  availableDeltaMinor: string;
  heldDeltaMinor: string;
  actorName: string | null;
  serviceCode: string | null;
  referenceId: string | null;
  reversalOfEntryId: string | null;
  reason: string | null;
  reversed: boolean;
  createdAt: string;
}

export interface WalletOverview {
  account: WalletAccount;
  entries: WalletEntry[];
}

export interface WalletMutationResult {
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

export async function getWalletOverview(
  accessToken: string,
): Promise<WalletOverview | null> {
  const response = await fetch(`${process.env.API_BASE_URL}/wallet/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    console.error(`GET /wallet/me başarısız: HTTP ${response.status}`);
    return null;
  }

  return (await response.json()) as WalletOverview;
}

export async function searchCashierWallets(
  accessToken: string,
  phone: string,
): Promise<WalletAccount[]> {
  if (!phone) {
    return [];
  }

  const response = await fetch(
    `${process.env.API_BASE_URL}/wallet/cashier/accounts?phone=${encodeURIComponent(phone)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    return [];
  }

  return (await response.json()) as WalletAccount[];
}

export async function getCashierWallet(
  accessToken: string,
  accountId: string,
): Promise<WalletOverview | null> {
  const response = await fetch(
    `${process.env.API_BASE_URL}/wallet/cashier/accounts/${encodeURIComponent(accountId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as WalletOverview;
}

export function createCashDeposit(
  accessToken: string,
  payload: {
    phoneE164: string;
    amountTl: string;
    idempotencyKey: string;
  },
) {
  return walletMutation(
    accessToken,
    '/wallet/cashier/deposits',
    payload,
    'Nakit bakiye yüklendi.',
  );
}

export function reverseCashDeposit(
  accessToken: string,
  entryId: string,
  payload: { reason: string; idempotencyKey: string },
) {
  return walletMutation(
    accessToken,
    `/wallet/cashier/deposits/${encodeURIComponent(entryId)}/reverse`,
    payload,
    'Nakit yükleme tam tutarıyla ters çevrildi.',
  );
}

async function walletMutation(
  accessToken: string,
  path: string,
  payload: object,
  successMessage: string,
): Promise<WalletMutationResult> {
  const response = await fetch(`${process.env.API_BASE_URL}${path}`, {
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
          : 'Cüzdan işlemi tamamlanamadı.',
      errors: body.errors,
    };
  }

  return { ok: true, message: successMessage };
}

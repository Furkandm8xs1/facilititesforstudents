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

export interface AdminUser {
  id: string;
  keycloakSubject: string;
  phoneE164: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEPARTED';
  roles: string[];
}

export interface UserRoleMutationResult {
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

export interface CanteenProduct {
  id: string;
  name: string;
  priceMinor: string;
  stockOnHand: string;
  stockReserved: string;
  availableStock: string;
  listed: boolean;
  customerVisible: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CanteenCatalog {
  canteen: {
    id: string;
    code: string;
    name: string;
    orderingEnabled: boolean;
  };
  products: CanteenProduct[];
}

export interface CanteenMutationResult {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
}

export type TeaCafeBeverageType = 'TEA' | 'COFFEE';

export interface TeaCafeBrew {
  id: string;
  beverageType: TeaCafeBeverageType;
  note: string | null;
  durationMinutes: number;
  startedAt: string;
  readyAt: string;
  preparedBy: string;
}

export interface TeaCafeOverview {
  brews: TeaCafeBrew[];
  serverTime: string;
}

export interface TeaCafeMutationResult {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
}

export type CanteenOrderStatus =
  | 'PLACED'
  | 'PREPARING'
  | 'READY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'CANCELLED_BY_CANTEEN';

export interface CanteenOrder {
  id: string;
  status: CanteenOrderStatus;
  totalMinor: string;
  customerName: string;
  customerPhone: string;
  items: Array<{
    productId: string;
    productName: string;
    unitPriceMinor: string;
    quantity: string;
    lineTotalMinor: string;
  }>;
  createdAt: string;
  updatedAt: string;
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

export async function getAdminUsers(
  accessToken: string,
): Promise<AdminUser[] | null> {
  const response = await fetch(`${process.env.API_BASE_URL}/admin/users`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    console.error(`GET /admin/users başarısız: HTTP ${response.status}`);
    return null;
  }

  return (await response.json()) as AdminUser[];
}

export async function updateAdminUserRoles(
  accessToken: string,
  userId: string,
  roles: string[],
): Promise<UserRoleMutationResult> {
  const response = await fetch(
    `${process.env.API_BASE_URL}/admin/users/${encodeURIComponent(userId)}/roles`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roles }),
      cache: 'no-store',
    },
  );
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
          : 'Kullanıcı rolleri güncellenemedi.',
      errors: body.errors,
    };
  }

  return { ok: true, message: 'Kullanıcı rolleri güncellendi.' };
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

export async function getCanteenCatalog(
  accessToken: string,
): Promise<CanteenCatalog | null> {
  return fetchCanteenCatalog(accessToken, '/canteen/catalog');
}

export async function getCanteenManagement(
  accessToken: string,
): Promise<CanteenCatalog | null> {
  return fetchCanteenCatalog(accessToken, '/canteen/manage');
}

export async function getCanteenOrders(
  accessToken: string,
): Promise<CanteenOrder[]> {
  return fetchCanteenOrders(accessToken, '/canteen/orders');
}

export async function getCanteenManagementOrders(
  accessToken: string,
): Promise<CanteenOrder[]> {
  return fetchCanteenOrders(accessToken, '/canteen/manage/orders');
}

export function placeCanteenOrder(
  accessToken: string,
  payload: {
    items: Array<{ productId: string; quantity: string }>;
    idempotencyKey: string;
  },
) {
  return canteenMutation(
    accessToken,
    'POST',
    '/canteen/orders',
    payload,
    'Sipariş alındı. Tutar bakiyenden düşüldü.',
  );
}

export function cancelCanteenOrder(accessToken: string, orderId: string) {
  return canteenMutation(
    accessToken,
    'POST',
    `/canteen/orders/${encodeURIComponent(orderId)}/cancel`,
    {},
    'Sipariş iptal edildi; tutar bakiyene, ürünler stoğa iade edildi.',
  );
}

export function transitionCanteenOrder(
  accessToken: string,
  orderId: string,
  payload: { status: CanteenOrderStatus },
) {
  return canteenMutation(
    accessToken,
    'PATCH',
    `/canteen/manage/orders/${encodeURIComponent(orderId)}/status`,
    payload,
    'Sipariş durumu güncellendi.',
  );
}

export function updateCanteenOrdering(accessToken: string, enabled: boolean) {
  return canteenMutation(
    accessToken,
    'PATCH',
    '/canteen/manage/ordering',
    { enabled },
    enabled ? 'Ana Kantin siparişe açıldı.' : 'Ana Kantin siparişe kapatıldı.',
  );
}

export function createOrUpdateCanteenProduct(
  accessToken: string,
  payload: { name: string; priceTl: string; stock: string },
) {
  return canteenMutation(
    accessToken,
    'POST',
    '/canteen/manage/products',
    payload,
    'Ürün Ana Kantin kataloğuna kaydedildi.',
  );
}

export function updateCanteenProductDetails(
  accessToken: string,
  productId: string,
  payload: { name: string; priceTl: string },
) {
  return canteenMutation(
    accessToken,
    'PATCH',
    `/canteen/manage/products/${encodeURIComponent(productId)}/details`,
    payload,
    'Ürün adı ve fiyatı güncellendi.',
  );
}

export function updateCanteenProductStock(
  accessToken: string,
  productId: string,
  stock: string,
) {
  return canteenMutation(
    accessToken,
    'PATCH',
    `/canteen/manage/products/${encodeURIComponent(productId)}/stock`,
    { stock },
    'Ürün stoğu güncellendi.',
  );
}

export function updateCanteenProductVisibility(
  accessToken: string,
  productId: string,
  listed: boolean,
) {
  return canteenMutation(
    accessToken,
    'PATCH',
    `/canteen/manage/products/${encodeURIComponent(productId)}/visibility`,
    { listed },
    listed ? 'Ürün satışa açıldı.' : 'Ürün satışa kapatıldı.',
  );
}

export function archiveCanteenProduct(accessToken: string, productId: string) {
  return canteenMutation(
    accessToken,
    'POST',
    `/canteen/manage/products/${encodeURIComponent(productId)}/archive`,
    {},
    'Ürün arşivlendi.',
  );
}

async function fetchCanteenCatalog(
  accessToken: string,
  path: string,
): Promise<CanteenCatalog | null> {
  const response = await fetch(`${process.env.API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    console.error(`GET ${path} başarısız: HTTP ${response.status}`);
    return null;
  }

  return (await response.json()) as CanteenCatalog;
}

async function fetchCanteenOrders(
  accessToken: string,
  path: string,
): Promise<CanteenOrder[]> {
  const response = await fetch(`${process.env.API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    console.error(`GET ${path} başarısız: HTTP ${response.status}`);
    return [];
  }

  return (await response.json()) as CanteenOrder[];
}

async function canteenMutation(
  accessToken: string,
  method: 'POST' | 'PATCH',
  path: string,
  payload: object,
  successMessage: string,
): Promise<CanteenMutationResult> {
  const response = await fetch(`${process.env.API_BASE_URL}${path}`, {
    method,
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
          : 'Kantin işlemi tamamlanamadı.',
      errors: body.errors,
    };
  }

  return { ok: true, message: successMessage };
}

export async function getTeaCafeOverview(
  accessToken: string,
): Promise<TeaCafeOverview | null> {
  const response = await fetch(`${process.env.API_BASE_URL}/tea-cafe/brews`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    console.error(`GET /tea-cafe/brews başarısız: HTTP ${response.status}`);
    return null;
  }

  return (await response.json()) as TeaCafeOverview;
}

export function createTeaCafeBrew(
  accessToken: string,
  payload: {
    beverageType: TeaCafeBeverageType | string;
    durationMinutes: string;
    note: string;
  },
) {
  return teaCafeMutation(
    accessToken,
    'POST',
    '/tea-cafe/manage/brews',
    payload,
    payload.beverageType === 'TEA'
      ? 'Çay kaydedildi; 21 dakika sonra hazır olacak.'
      : 'Kahve demleme kaydı oluşturuldu.',
  );
}

export function deleteTeaCafeBrew(accessToken: string, brewId: string) {
  return teaCafeMutation(
    accessToken,
    'DELETE',
    `/tea-cafe/manage/brews/${encodeURIComponent(brewId)}`,
    undefined,
    'Demleme kaydı silindi.',
  );
}

async function teaCafeMutation(
  accessToken: string,
  method: 'POST' | 'DELETE',
  path: string,
  payload: object | undefined,
  successMessage: string,
): Promise<TeaCafeMutationResult> {
  const response = await fetch(`${process.env.API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
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
          : 'Tea & Cafe işlemi tamamlanamadı.',
      errors: body.errors,
    };
  }

  return { ok: true, message: successMessage };
}

import { BadRequestException } from '@nestjs/common';

const phonePattern = /^\+[1-9][0-9]{7,14}$/;
const phoneSearchPattern = /^\+[1-9][0-9]{2,14}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxWholeTl = 92_233_720_368_547_758n;

export interface CashDepositInput {
  phoneE164: string;
  amountMinor: bigint;
  idempotencyKey: string;
}

export interface CashDepositReversalInput {
  entryId: string;
  reason: string;
  idempotencyKey: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validationError(errors: Record<string, string>): never {
  throw new BadRequestException({
    message: 'Cüzdan işlem bilgileri geçerli değil.',
    errors,
  });
}

function parseIdempotencyKey(value: unknown, errors: Record<string, string>) {
  const idempotencyKey = text(value);

  if (!uuidPattern.test(idempotencyKey)) {
    errors.idempotencyKey = 'İşlem anahtarı geçerli değil; sayfayı yenileyin.';
  }

  return idempotencyKey;
}

export function parseCashDepositInput(value: unknown): CashDepositInput {
  if (!isRecord(value)) {
    throw new BadRequestException('Nakit yükleme bilgileri gönderilmelidir.');
  }

  const phoneE164 = text(value.phoneE164).replaceAll(' ', '');
  const amountTl = text(value.amountTl);
  const errors: Record<string, string> = {};
  const idempotencyKey = parseIdempotencyKey(value.idempotencyKey, errors);

  if (!phonePattern.test(phoneE164)) {
    errors.phoneE164 = 'Telefon +905551112233 biçiminde olmalıdır.';
  }

  if (!/^[1-9][0-9]*$/.test(amountTl)) {
    errors.amountTl = 'Tutar sıfırdan büyük, tam TL olmalıdır.';
  }

  let amountMinor = 0n;

  if (!errors.amountTl) {
    const wholeTl = BigInt(amountTl);

    if (wholeTl > maxWholeTl) {
      errors.amountTl = 'Tutar desteklenen sınırın üzerindedir.';
    } else {
      amountMinor = wholeTl * 100n;
    }
  }

  if (Object.keys(errors).length > 0) {
    validationError(errors);
  }

  return { phoneE164, amountMinor, idempotencyKey };
}

export function parseCashDepositReversalInput(
  entryIdValue: unknown,
  value: unknown,
): CashDepositReversalInput {
  if (!isRecord(value)) {
    throw new BadRequestException('Ters kayıt bilgileri gönderilmelidir.');
  }

  const entryId = text(entryIdValue);
  const reason = text(value.reason);
  const errors: Record<string, string> = {};
  const idempotencyKey = parseIdempotencyKey(value.idempotencyKey, errors);

  if (!uuidPattern.test(entryId)) {
    errors.entryId = 'Ters çevrilecek işlem geçerli değil.';
  }

  if (reason.length < 3 || reason.length > 500) {
    errors.reason = 'Düzeltme gerekçesi 3-500 karakter arasında olmalıdır.';
  }

  if (Object.keys(errors).length > 0) {
    validationError(errors);
  }

  return { entryId, reason, idempotencyKey };
}

export function parsePhoneSearch(value: unknown): string | null {
  const phone = text(value).replaceAll(' ', '');

  if (!phone) {
    return null;
  }

  if (!phoneSearchPattern.test(phone)) {
    throw new BadRequestException(
      'Arama için ülke koduyla en az üç rakam girin.',
    );
  }

  return phone;
}

export function parseWalletAccountId(value: unknown): string {
  const accountId = text(value);

  if (!uuidPattern.test(accountId)) {
    throw new BadRequestException('Cüzdan hesabı geçerli değil.');
  }

  return accountId;
}

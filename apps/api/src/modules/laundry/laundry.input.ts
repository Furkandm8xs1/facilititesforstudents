import { BadRequestException } from '@nestjs/common';

import type { LaundryMachineType } from './laundry.constants';

export interface StartRunInput {
  phoneE164: string;
  machineType: LaundryMachineType;
  machineNumber: number;
  idempotencyKey: string;
}

export interface TransferInput {
  machineType: LaundryMachineType;
  machineNumber: number;
  idempotencyKey: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const phonePattern = /^\+[1-9][0-9]{7,14}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseMachine(
  value: Record<string, unknown>,
  errors: Record<string, string>,
) {
  const machineType = text(value.machineType).toUpperCase();
  const rawNumber = value.machineNumber;
  const machineNumber = typeof rawNumber === 'number' ? rawNumber : Number.NaN;

  if (machineType !== 'WASH' && machineType !== 'DRY') {
    errors.machineType = 'Makine türü WASH veya DRY olmalıdır.';
  }

  const maximum = machineType === 'WASH' ? 7 : 8;
  if (
    !Number.isSafeInteger(machineNumber) ||
    machineNumber < 1 ||
    machineNumber > maximum
  ) {
    errors.machineNumber =
      machineType === 'WASH'
        ? 'Yıkama makinesi numarası 1-7 arasında olmalıdır.'
        : 'Kurutma makinesi numarası 1-8 arasında olmalıdır.';
  }

  return {
    machineType: machineType as LaundryMachineType,
    machineNumber,
  };
}

function parseIdempotencyKey(value: unknown, errors: Record<string, string>) {
  const idempotencyKey = text(value);
  if (idempotencyKey.length < 8 || idempotencyKey.length > 120) {
    errors.idempotencyKey =
      'İşlem güvenlik anahtarı 8-120 karakter arasında olmalıdır.';
  }
  return idempotencyKey;
}

function throwErrors(errors: Record<string, string>) {
  if (Object.keys(errors).length) {
    throw new BadRequestException({
      message: 'Çamaşırhane işlem bilgileri geçerli değil.',
      errors,
    });
  }
}

export function parseStartRunInput(value: unknown): StartRunInput {
  if (!isRecord(value)) {
    throw new BadRequestException(
      'Çamaşırhane işlem bilgileri gönderilmelidir.',
    );
  }

  const errors: Record<string, string> = {};
  const phoneE164 = text(value.phoneE164);
  const machine = parseMachine(value, errors);
  const idempotencyKey = parseIdempotencyKey(value.idempotencyKey, errors);

  if (!phonePattern.test(phoneE164)) {
    errors.phoneE164 = 'Telefon numarası E.164 biçiminde olmalıdır.';
  }
  throwErrors(errors);
  return { phoneE164, ...machine, idempotencyKey };
}

export function parseTransferInput(value: unknown): TransferInput {
  if (!isRecord(value)) {
    throw new BadRequestException('Aktarım bilgileri gönderilmelidir.');
  }

  const errors: Record<string, string> = {};
  const machine = parseMachine(value, errors);
  const idempotencyKey = parseIdempotencyKey(value.idempotencyKey, errors);
  throwErrors(errors);
  return { ...machine, idempotencyKey };
}

export function parseRefundInput(value: unknown) {
  if (!isRecord(value)) {
    throw new BadRequestException('İade bilgileri gönderilmelidir.');
  }

  const errors: Record<string, string> = {};
  const reason = text(value.reason).replace(/\s+/g, ' ');
  const idempotencyKey = parseIdempotencyKey(value.idempotencyKey, errors);
  if (reason.length < 3 || reason.length > 500) {
    errors.reason = 'İade gerekçesi 3-500 karakter arasında olmalıdır.';
  }
  throwErrors(errors);
  return { reason, idempotencyKey };
}

export function parseTariffInput(value: unknown) {
  if (!isRecord(value)) {
    throw new BadRequestException('Tarife bilgileri gönderilmelidir.');
  }

  const errors: Record<string, string> = {};
  const parsePrice = (raw: unknown, field: string) => {
    if (
      typeof raw !== 'number' ||
      !Number.isSafeInteger(raw) ||
      raw < 1 ||
      raw > 100_000
    ) {
      errors[field] = 'Fiyat 1-100000 arasında tam TL olmalıdır.';
      return 0n;
    }
    return BigInt(raw) * 100n;
  };

  const washPriceMinor = parsePrice(value.washPriceTl, 'washPriceTl');
  const dryPriceMinor = parsePrice(value.dryPriceTl, 'dryPriceTl');
  throwErrors(errors);
  return { washPriceMinor, dryPriceMinor };
}

export function parseLoadId(value: unknown) {
  const loadId = text(value);
  if (!uuidPattern.test(loadId)) {
    throw new BadRequestException('Çamaşır yükü kimliği geçerli değil.');
  }
  return loadId;
}

export function parsePhoneQuery(value: unknown) {
  const phone = text(value);
  if (!phonePattern.test(phone)) {
    throw new BadRequestException(
      'Telefon numarası E.164 biçiminde olmalıdır.',
    );
  }
  return phone;
}

export function parseCustomerSearchInput(value: unknown) {
  if (!isRecord(value)) {
    throw new BadRequestException('Telefon bilgisi gönderilmelidir.');
  }
  return parsePhoneQuery(value.phone);
}

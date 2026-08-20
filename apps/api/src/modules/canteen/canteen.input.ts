import { BadRequestException } from '@nestjs/common';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxWholeTl = 92_233_720_368_547_758n;
const maxStock = 9_223_372_036_854_775_807n;

export interface CreateProductInput {
  name: string;
  nameKey: string;
  priceMinor: bigint;
  stockOnHand: bigint;
}

export interface UpdateProductDetailsInput {
  name: string;
  nameKey: string;
  priceMinor: bigint;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validationError(errors: Record<string, string>): never {
  throw new BadRequestException({
    message: 'Ürün bilgileri geçerli değil.',
    errors,
  });
}

function parseName(value: unknown, errors: Record<string, string>) {
  const name = text(value).replace(/\s+/g, ' ');

  if (!name || name.length > 120) {
    errors.name = 'Ürün adı 1-120 karakter arasında olmalıdır.';
  }

  return {
    name,
    nameKey: name.toLocaleLowerCase('tr-TR'),
  };
}

function parsePriceMinor(value: unknown, errors: Record<string, string>) {
  const priceTl = text(value);

  if (!/^[1-9][0-9]*$/.test(priceTl)) {
    errors.priceTl = 'Fiyat sıfırdan büyük, tam TL olmalıdır.';
    return 0n;
  }

  const wholeTl = BigInt(priceTl);

  if (wholeTl > maxWholeTl) {
    errors.priceTl = 'Fiyat desteklenen sınırın üzerindedir.';
    return 0n;
  }

  return wholeTl * 100n;
}

function parseStockValue(value: unknown, errors: Record<string, string>) {
  const stock = text(value);

  if (!/^(0|[1-9][0-9]*)$/.test(stock)) {
    errors.stock = 'Stok sıfır veya pozitif tam adet olmalıdır.';
    return 0n;
  }

  const parsed = BigInt(stock);

  if (parsed > maxStock) {
    errors.stock = 'Stok desteklenen sınırın üzerindedir.';
    return 0n;
  }

  return parsed;
}

export function parseCreateProductInput(value: unknown): CreateProductInput {
  if (!isRecord(value)) {
    throw new BadRequestException('Ürün bilgileri gönderilmelidir.');
  }

  const errors: Record<string, string> = {};
  const { name, nameKey } = parseName(value.name, errors);
  const priceMinor = parsePriceMinor(value.priceTl, errors);
  const stockOnHand = parseStockValue(value.stock, errors);

  if (Object.keys(errors).length > 0) {
    validationError(errors);
  }

  return { name, nameKey, priceMinor, stockOnHand };
}

export function parseUpdateProductDetailsInput(
  value: unknown,
): UpdateProductDetailsInput {
  if (!isRecord(value)) {
    throw new BadRequestException('Ürün bilgileri gönderilmelidir.');
  }

  const errors: Record<string, string> = {};
  const { name, nameKey } = parseName(value.name, errors);
  const priceMinor = parsePriceMinor(value.priceTl, errors);

  if (Object.keys(errors).length > 0) {
    validationError(errors);
  }

  return { name, nameKey, priceMinor };
}

export function parseStockInput(value: unknown): bigint {
  if (!isRecord(value)) {
    throw new BadRequestException('Stok bilgisi gönderilmelidir.');
  }

  const errors: Record<string, string> = {};
  const stock = parseStockValue(value.stock, errors);

  if (Object.keys(errors).length > 0) {
    validationError(errors);
  }

  return stock;
}

export function parseVisibilityInput(value: unknown): boolean {
  if (!isRecord(value) || typeof value.listed !== 'boolean') {
    throw new BadRequestException('Satış durumu geçerli değil.');
  }

  return value.listed;
}

export function parseProductId(value: unknown): string {
  const productId = text(value);

  if (!uuidPattern.test(productId)) {
    throw new BadRequestException('Ürün kaydı geçerli değil.');
  }

  return productId;
}

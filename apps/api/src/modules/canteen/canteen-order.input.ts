import { BadRequestException } from '@nestjs/common';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = [
  'PREPARING',
  'READY',
  'DELIVERED',
  'CANCELLED_BY_CANTEEN',
] as const;

export type ManagementOrderStatus = (typeof statuses)[number];

export interface PlaceOrderInput {
  items: Array<{ productId: string; quantity: bigint }>;
  idempotencyKey: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parsePlaceOrderInput(value: unknown): PlaceOrderInput {
  if (!isRecord(value)) {
    throw new BadRequestException('Sipariş bilgileri gönderilmelidir.');
  }

  const idempotencyKey = text(value.idempotencyKey);
  const rawItems = Array.isArray(value.items) ? value.items : [];
  const errors: Record<string, string> = {};

  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    errors.idempotencyKey = 'Sipariş güvenlik anahtarı geçerli değil.';
  }

  if (rawItems.length === 0 || rawItems.length > 20) {
    errors.items = 'Sipariş 1-20 farklı ürün içermelidir.';
  }

  const quantities = new Map<string, bigint>();

  for (const rawItem of rawItems) {
    if (!isRecord(rawItem)) {
      errors.items = 'Sipariş ürünleri geçerli değil.';
      continue;
    }

    const productId = text(rawItem.productId);
    const quantityText = text(rawItem.quantity);

    if (!uuidPattern.test(productId) || !/^[1-9][0-9]*$/.test(quantityText)) {
      errors.items = 'Ürün ve adet bilgileri geçerli değil.';
      continue;
    }

    const quantity = BigInt(quantityText);

    if (quantity > 100n) {
      errors.items = 'Bir üründen tek siparişte en fazla 100 adet alınabilir.';
      continue;
    }

    const combinedQuantity = (quantities.get(productId) ?? 0n) + quantity;

    if (combinedQuantity > 100n) {
      errors.items = 'Bir üründen tek siparişte en fazla 100 adet alınabilir.';
      continue;
    }

    quantities.set(productId, combinedQuantity);
  }

  if (Object.keys(errors).length > 0) {
    throw new BadRequestException({
      message: 'Sipariş bilgileri geçerli değil.',
      errors,
    });
  }

  return {
    idempotencyKey,
    items: [...quantities.entries()].map(([productId, quantity]) => ({
      productId,
      quantity,
    })),
  };
}

export function parseOrderId(value: unknown): string {
  const orderId = text(value);

  if (!uuidPattern.test(orderId)) {
    throw new BadRequestException('Sipariş kaydı geçerli değil.');
  }

  return orderId;
}

export function parseOrderTransitionInput(value: unknown): {
  status: ManagementOrderStatus;
} {
  if (!isRecord(value) || !statuses.includes(value.status as never)) {
    throw new BadRequestException('Sipariş durumu geçerli değil.');
  }

  const status = value.status as ManagementOrderStatus;
  return { status };
}

export function parseOrderingInput(value: unknown): boolean {
  if (!isRecord(value) || typeof value.enabled !== 'boolean') {
    throw new BadRequestException('Kantin sipariş durumu geçerli değil.');
  }

  return value.enabled;
}

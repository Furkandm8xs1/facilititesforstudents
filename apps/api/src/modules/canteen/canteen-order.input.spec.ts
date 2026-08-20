import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  parseOrderTransitionInput,
  parsePlaceOrderInput,
} from './canteen-order.input';

describe('canteen order input', () => {
  it('combines repeated products and parses whole quantities', () => {
    expect(
      parsePlaceOrderInput({
        idempotencyKey: 'order-test-123',
        items: [
          {
            productId: '0d5af6b8-1e22-4a50-ad85-53db06315217',
            quantity: '2',
          },
          {
            productId: '0d5af6b8-1e22-4a50-ad85-53db06315217',
            quantity: '1',
          },
        ],
      }).items,
    ).toEqual([
      {
        productId: '0d5af6b8-1e22-4a50-ad85-53db06315217',
        quantity: 3n,
      },
    ]);
  });

  it('rejects zero and fractional quantities', () => {
    for (const quantity of ['0', '1.5']) {
      expect(() =>
        parsePlaceOrderInput({
          idempotencyKey: 'order-test-123',
          items: [
            {
              productId: '0d5af6b8-1e22-4a50-ad85-53db06315217',
              quantity,
            },
          ],
        }),
      ).toThrow(BadRequestException);
    }
  });

  it('rejects a combined quantity above the order limit', () => {
    expect(() =>
      parsePlaceOrderInput({
        idempotencyKey: 'order-test-123',
        items: [
          {
            productId: '0d5af6b8-1e22-4a50-ad85-53db06315217',
            quantity: '60',
          },
          {
            productId: '0d5af6b8-1e22-4a50-ad85-53db06315217',
            quantity: '60',
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts direct preparation and delivery transitions', () => {
    expect(parseOrderTransitionInput({ status: 'PREPARING' })).toEqual({
      status: 'PREPARING',
    });
    expect(parseOrderTransitionInput({ status: 'READY' })).toEqual({
      status: 'READY',
    });
    expect(parseOrderTransitionInput({ status: 'DELIVERED' })).toEqual({
      status: 'DELIVERED',
    });
  });
});

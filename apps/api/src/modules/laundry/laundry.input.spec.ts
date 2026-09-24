import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  parseCustomerSearchInput,
  parseRefundInput,
  parseStartRunInput,
  parseTariffInput,
  parseTransferInput,
} from './laundry.input';

describe('laundry input', () => {
  it('accepts valid wash and dry machine ranges', () => {
    expect(
      parseStartRunInput({
        phoneE164: '+905551112233',
        machineType: 'wash',
        machineNumber: 7,
        idempotencyKey: 'load-request-1',
      }),
    ).toEqual({
      phoneE164: '+905551112233',
      machineType: 'WASH',
      machineNumber: 7,
      idempotencyKey: 'load-request-1',
    });
    expect(
      parseTransferInput({
        machineType: 'DRY',
        machineNumber: 8,
        idempotencyKey: 'transfer-request-1',
      }),
    ).toEqual({
      machineType: 'DRY',
      machineNumber: 8,
      idempotencyKey: 'transfer-request-1',
    });
  });

  it('rejects machine numbers outside the type-specific range', () => {
    expect(() =>
      parseTransferInput({
        machineType: 'WASH',
        machineNumber: 8,
        idempotencyKey: 'transfer-request-2',
      }),
    ).toThrow(BadRequestException);
  });

  it('requires whole TL tariffs and converts them to minor units', () => {
    expect(parseTariffInput({ washPriceTl: 20, dryPriceTl: 12 })).toEqual({
      washPriceMinor: 2_000n,
      dryPriceMinor: 1_200n,
    });
    expect(() =>
      parseTariffInput({ washPriceTl: 20.5, dryPriceTl: 12 }),
    ).toThrow(BadRequestException);
  });

  it('normalizes a valid refund reason', () => {
    expect(
      parseRefundInput({
        reason: '  Makine   arızası ',
        idempotencyKey: 'refund-request-1',
      }),
    ).toEqual({
      reason: 'Makine arızası',
      idempotencyKey: 'refund-request-1',
    });
  });

  it('accepts customer search phone only from a request body', () => {
    expect(parseCustomerSearchInput({ phone: '+905551112233' })).toBe(
      '+905551112233',
    );
    expect(() => parseCustomerSearchInput('+905551112233')).toThrow(
      BadRequestException,
    );
  });
});

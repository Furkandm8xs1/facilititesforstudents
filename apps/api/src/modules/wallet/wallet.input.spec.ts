import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  parseCashDepositInput,
  parseCashDepositReversalInput,
} from './wallet.input';

const idempotencyKey = 'cb2b4f01-ed3a-4be8-a839-d2f4fc985121';

describe('wallet input', () => {
  it('converts whole TL to minor units', () => {
    expect(
      parseCashDepositInput({
        phoneE164: '+905550000001',
        amountTl: '125',
        idempotencyKey,
      }),
    ).toEqual({
      phoneE164: '+905550000001',
      amountMinor: 12_500n,
      idempotencyKey,
    });
  });

  it('rejects fractional TL values', () => {
    expect(() =>
      parseCashDepositInput({
        phoneE164: '+905550000001',
        amountTl: '125,50',
        idempotencyKey,
      }),
    ).toThrow(BadRequestException);
  });

  it('requires a reason for full reversal', () => {
    expect(() =>
      parseCashDepositReversalInput('0d5af6b8-1e22-4a50-ad85-53db06315217', {
        reason: '',
        idempotencyKey,
      }),
    ).toThrow(BadRequestException);
  });
});

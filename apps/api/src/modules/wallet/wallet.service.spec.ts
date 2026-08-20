import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { WalletRuleError } from './wallet.errors';
import type { WalletRepository } from './wallet.repository';
import { WalletService } from './wallet.service';

const input = {
  phoneE164: '+905550000001',
  amountTl: '100',
  idempotencyKey: 'cb2b4f01-ed3a-4be8-a839-d2f4fc985121',
};

describe('WalletService', () => {
  it('forbids a cashier from loading their own wallet', async () => {
    const repository = {
      createCashDeposit: vi
        .fn()
        .mockRejectedValue(new WalletRuleError('SELF_DEPOSIT')),
    } as unknown as WalletRepository;
    const service = new WalletService(repository);

    await expect(service.createCashDeposit('subject', input)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('blocks a reversal that would make the balance negative', async () => {
    const repository = {
      reverseCashDeposit: vi
        .fn()
        .mockRejectedValue(new WalletRuleError('INSUFFICIENT_AVAILABLE')),
    } as unknown as WalletRepository;
    const service = new WalletService(repository);

    await expect(
      service.reverseCashDeposit(
        'subject',
        '0d5af6b8-1e22-4a50-ad85-53db06315217',
        {
          reason: 'Hatalı nakit girişi',
          idempotencyKey: '1af64467-833e-4e09-b107-a30877c2a63f',
        },
      ),
    ).rejects.toThrow(ConflictException);
  });
});

import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { LaundryRuleError } from './laundry.errors';
import type { LaundryRepository } from './laundry.repository';
import { LaundryService } from './laundry.service';

describe('LaundryService', () => {
  it('validates and forwards a load start request', async () => {
    const repository = {
      createLoad: vi.fn().mockResolvedValue({ id: 'load-id' }),
    } as unknown as LaundryRepository;
    const service = new LaundryService(repository);

    await service.createLoad('operator-subject', {
      phoneE164: '+905551112233',
      machineType: 'WASH',
      machineNumber: 1,
      idempotencyKey: 'start-request-1',
    });

    expect(repository.createLoad).toHaveBeenCalledWith({
      actorSubject: 'operator-subject',
      phoneE164: '+905551112233',
      machineType: 'WASH',
      machineNumber: 1,
      idempotencyKey: 'start-request-1',
    });
  });

  it('maps insufficient wallet balance to HTTP 409', async () => {
    const repository = {
      createLoad: vi
        .fn()
        .mockRejectedValue(new LaundryRuleError('INSUFFICIENT_BALANCE')),
    } as unknown as LaundryRepository;
    const service = new LaundryService(repository);

    await expect(
      service.createLoad('operator-subject', {
        phoneE164: '+905551112233',
        machineType: 'DRY',
        machineNumber: 1,
        idempotencyKey: 'start-request-2',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('prevents removing clothes before the machine duration ends', async () => {
    const repository = {
      completeLoad: vi
        .fn()
        .mockRejectedValue(new LaundryRuleError('RUN_NOT_READY')),
    } as unknown as LaundryRepository;
    const service = new LaundryService(repository);

    await expect(
      service.completeLoad(
        'operator-subject',
        '550e8400-e29b-41d4-a716-446655440000',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('converts manager tariff prices to minor units', async () => {
    const repository = {
      updateTariffs: vi.fn().mockResolvedValue({}),
    } as unknown as LaundryRepository;
    const service = new LaundryService(repository);

    await service.updateTariffs('manager-subject', {
      washPriceTl: 18,
      dryPriceTl: 11,
    });

    expect(repository.updateTariffs).toHaveBeenCalledWith({
      actorSubject: 'manager-subject',
      washPriceMinor: 1_800n,
      dryPriceMinor: 1_100n,
    });
  });
});

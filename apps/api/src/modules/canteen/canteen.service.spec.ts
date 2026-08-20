import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { CanteenRuleError } from './canteen.errors';
import type { CanteenOrderRepository } from './canteen-order.repository';
import type { CanteenRepository } from './canteen.repository';
import { CanteenService } from './canteen.service';

describe('CanteenService', () => {
  it('keeps stock above future order reservations', async () => {
    const repository = {
      setProductStock: vi
        .fn()
        .mockRejectedValue(new CanteenRuleError('STOCK_BELOW_RESERVED')),
    } as unknown as CanteenRepository;
    const service = new CanteenService(
      repository,
      {} as CanteenOrderRepository,
    );

    await expect(
      service.setProductStock(
        'subject',
        '0d5af6b8-1e22-4a50-ad85-53db06315217',
        { stock: '2' },
      ),
    ).rejects.toThrow(ConflictException);
  });
});

import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { TeaCafeRuleError } from './tea-cafe.errors';
import type { TeaCafeRepository } from './tea-cafe.repository';
import { TeaCafeService } from './tea-cafe.service';

describe('TeaCafeService', () => {
  it('enforces the fixed tea duration before persisting', async () => {
    const repository = {
      createBrew: vi.fn().mockResolvedValue({ id: 'brew-id' }),
    } as unknown as TeaCafeRepository;
    const service = new TeaCafeService(repository);

    await service.createBrew('subject', {
      beverageType: 'TEA',
      durationMinutes: '60',
    });

    expect(repository.createBrew).toHaveBeenCalledWith({
      actorSubject: 'subject',
      beverageType: 'TEA',
      durationMinutes: 21,
      note: null,
    });
  });

  it('maps a missing brew to an HTTP not-found error', async () => {
    const repository = {
      deleteBrew: vi
        .fn()
        .mockRejectedValue(new TeaCafeRuleError('BREW_NOT_FOUND')),
    } as unknown as TeaCafeRepository;
    const service = new TeaCafeService(repository);

    await expect(
      service.deleteBrew('subject', '0d5af6b8-1e22-4a50-ad85-53db06315217'),
    ).rejects.toThrow(NotFoundException);
  });
});

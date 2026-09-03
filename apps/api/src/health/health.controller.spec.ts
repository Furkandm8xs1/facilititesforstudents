import { describe, expect, it } from 'vitest';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports the API and its initial modules', () => {
    const response = new HealthController().getHealth();

    expect(response.status).toBe('ok');
    expect(response.modules).toEqual(['core', 'wallet', 'canteen', 'tea-cafe']);
  });
});

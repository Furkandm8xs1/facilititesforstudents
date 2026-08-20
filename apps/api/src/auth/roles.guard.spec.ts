import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { RolesGuard } from './roles.guard';

function contextWithRoles(roles: string[]): ExecutionContext {
  return {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({
      getRequest: () => ({
        user: {
          subject: 'user-id',
          realmRoles: roles,
          clientRoles: [],
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(['platform_admin']),
  } as unknown as Reflector;
  const guard = new RolesGuard(reflector);

  it('accepts a user with every required role', () => {
    expect(guard.canActivate(contextWithRoles(['platform_admin']))).toBe(true);
  });

  it('rejects a user without the required role', () => {
    expect(() => guard.canActivate(contextWithRoles(['portal_user']))).toThrow(
      ForbiddenException,
    );
  });
});

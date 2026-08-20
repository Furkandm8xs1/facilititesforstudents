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
  function guardWith(
    required: string[] | undefined,
    any: string[] | undefined,
  ) {
    const reflector = {
      getAllAndOverride: vi
        .fn()
        .mockReturnValueOnce(required)
        .mockReturnValueOnce(any),
    } as unknown as Reflector;

    return new RolesGuard(reflector);
  }

  it('accepts a user with every required role', () => {
    const guard = guardWith(['platform_admin'], undefined);
    expect(guard.canActivate(contextWithRoles(['platform_admin']))).toBe(true);
  });

  it('rejects a user without the required role', () => {
    const guard = guardWith(['platform_admin'], undefined);
    expect(() => guard.canActivate(contextWithRoles(['portal_user']))).toThrow(
      ForbiddenException,
    );
  });

  it('accepts a user with any one of the alternative roles', () => {
    const guard = guardWith(undefined, ['canteen_manager', 'canteen_operator']);

    expect(guard.canActivate(contextWithRoles(['canteen_manager']))).toBe(true);
  });

  it('rejects a user without any alternative role', () => {
    const guard = guardWith(undefined, ['canteen_manager', 'canteen_operator']);

    expect(() => guard.canActivate(contextWithRoles(['portal_user']))).toThrow(
      ForbiddenException,
    );
  });
});

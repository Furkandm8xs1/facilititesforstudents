import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedRequest } from './authenticated-request';
import { ANY_REQUIRED_ROLES_KEY, REQUIRED_ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    const anyRequiredRoles = this.reflector.getAllAndOverride<string[]>(
      ANY_REQUIRED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length && !anyRequiredRoles?.length) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const assignedRoles = new Set([...user.realmRoles, ...user.clientRoles]);

    const hasEveryRequiredRole =
      !requiredRoles?.length ||
      requiredRoles.every((role) => assignedRoles.has(role));
    const hasAnyRequiredRole =
      !anyRequiredRoles?.length ||
      anyRequiredRoles.some((role) => assignedRoles.has(role));

    if (!hasEveryRequiredRole || !hasAnyRequiredRole) {
      throw new ForbiddenException('Bu işlem için gerekli rol bulunmuyor.');
    }

    return true;
  }
}

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedRequest } from './authenticated-request';
import { KeycloakJwtService } from './keycloak-jwt.service';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly keycloakJwt: KeycloakJwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Geçerli bir erişim belirteci gerekli.');
    }

    try {
      request.user = await this.keycloakJwt.verify(authorization.slice(7));
      return true;
    } catch (error) {
      this.logger.warn(
        `Erişim belirteci doğrulanamadı: ${error instanceof Error ? error.message : 'bilinmeyen hata'}`,
      );
      throw new UnauthorizedException('Erişim belirteci doğrulanamadı.');
    }
  }
}

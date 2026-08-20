import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { JwtAuthGuard } from './jwt-auth.guard';
import { KeycloakJwtService } from './keycloak-jwt.service';
import { RolesGuard } from './roles.guard';

@Module({
  providers: [
    KeycloakJwtService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}

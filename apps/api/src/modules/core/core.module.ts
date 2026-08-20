import { Module } from '@nestjs/common';

import { AdminUsersController } from './admin/admin-users.controller';
import { KeycloakAdminService } from './admin/keycloak-admin.service';
import { UserProvisioningService } from './admin/user-provisioning.service';
import { MeController } from './me.controller';
import { UserProfileRepository } from './user-profile.repository';

@Module({
  controllers: [MeController, AdminUsersController],
  providers: [
    UserProfileRepository,
    KeycloakAdminService,
    UserProvisioningService,
  ],
  exports: [UserProfileRepository],
})
export class CoreModule {}

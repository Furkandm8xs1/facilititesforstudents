import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../../../auth/authenticated-request';
import { RequireRoles } from '../../../auth/roles.decorator';
import { UserAdministrationService } from './user-administration.service';
import { UserProvisioningService } from './user-provisioning.service';

@RequireRoles('platform_admin')
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly userProvisioning: UserProvisioningService,
    private readonly userAdministration: UserAdministrationService,
  ) {}

  @Get()
  listUsers() {
    return this.userAdministration.list();
  }

  @Post()
  createUser(@Body() body: unknown) {
    return this.userProvisioning.create(body);
  }

  @Patch(':userId/roles')
  updateUserRoles(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.userAdministration.updateRoles(
      userId,
      request.user.subject,
      body,
    );
  }
}

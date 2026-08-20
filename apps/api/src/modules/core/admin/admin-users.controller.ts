import { Body, Controller, Post } from '@nestjs/common';

import { RequireRoles } from '../../../auth/roles.decorator';
import { UserProvisioningService } from './user-provisioning.service';

@RequireRoles('platform_admin')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly userProvisioning: UserProvisioningService) {}

  @Post()
  createUser(@Body() body: unknown) {
    return this.userProvisioning.create(body);
  }
}

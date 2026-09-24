import { Controller, Get, Req } from '@nestjs/common';

import type { AuthenticatedRequest } from '../../auth/authenticated-request';
import { LaundryService } from './laundry.service';

@Controller('laundry')
export class LaundryController {
  constructor(private readonly laundry: LaundryService) {}

  @Get('me')
  getMyLoads(@Req() request: AuthenticatedRequest) {
    return this.laundry.getMyLoads(request.user.subject);
  }

  @Get('config')
  getConfig() {
    return this.laundry.getConfig();
  }
}

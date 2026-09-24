import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';

import type { AuthenticatedRequest } from '../../auth/authenticated-request';
import { RequireAnyRole, RequireRoles } from '../../auth/roles.decorator';
import { LaundryService } from './laundry.service';

@RequireAnyRole('laundry_operator', 'laundry_manager')
@Controller('laundry/manage')
export class LaundryManagementController {
  constructor(private readonly laundry: LaundryService) {}

  @Get()
  getManagementView() {
    return this.laundry.getManagementView();
  }

  @Post('customers/search')
  searchCustomers(@Body() body: unknown) {
    return this.laundry.searchCustomers(body);
  }

  @Post('loads')
  createLoad(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.laundry.createLoad(request.user.subject, body);
  }

  @Post('loads/:loadId/transfer')
  transferLoad(
    @Req() request: AuthenticatedRequest,
    @Param('loadId') loadId: string,
    @Body() body: unknown,
  ) {
    return this.laundry.transferLoad(request.user.subject, loadId, body);
  }

  @Post('loads/:loadId/complete')
  completeLoad(
    @Req() request: AuthenticatedRequest,
    @Param('loadId') loadId: string,
  ) {
    return this.laundry.completeLoad(request.user.subject, loadId);
  }

  @Post('loads/:loadId/refund')
  refundLoad(
    @Req() request: AuthenticatedRequest,
    @Param('loadId') loadId: string,
    @Body() body: unknown,
  ) {
    return this.laundry.refundLoad(request.user.subject, loadId, body);
  }

  @RequireRoles('laundry_manager')
  @Patch('tariffs')
  updateTariffs(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.laundry.updateTariffs(request.user.subject, body);
  }
}

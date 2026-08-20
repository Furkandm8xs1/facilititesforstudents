import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';

import type { AuthenticatedRequest } from '../../auth/authenticated-request';
import { RequireAnyRole, RequireRoles } from '../../auth/roles.decorator';
import { CanteenService } from './canteen.service';

@RequireAnyRole('canteen_manager', 'canteen_operator')
@Controller('canteen/manage')
export class CanteenManagementController {
  constructor(private readonly canteen: CanteenService) {}

  @Get()
  getCatalog() {
    return this.canteen.getManagementCatalog();
  }

  @RequireRoles('canteen_manager')
  @Post('products')
  createOrUpdateProduct(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.canteen.createOrUpdateProduct(request.user.subject, body);
  }

  @RequireRoles('canteen_manager')
  @Patch('products/:productId/details')
  updateProductDetails(
    @Req() request: AuthenticatedRequest,
    @Param('productId') productId: string,
    @Body() body: unknown,
  ) {
    return this.canteen.updateProductDetails(
      request.user.subject,
      productId,
      body,
    );
  }

  @Patch('products/:productId/stock')
  setProductStock(
    @Req() request: AuthenticatedRequest,
    @Param('productId') productId: string,
    @Body() body: unknown,
  ) {
    return this.canteen.setProductStock(request.user.subject, productId, body);
  }

  @Patch('products/:productId/visibility')
  setProductVisibility(
    @Req() request: AuthenticatedRequest,
    @Param('productId') productId: string,
    @Body() body: unknown,
  ) {
    return this.canteen.setProductVisibility(
      request.user.subject,
      productId,
      body,
    );
  }

  @Post('products/:productId/archive')
  archiveProduct(
    @Req() request: AuthenticatedRequest,
    @Param('productId') productId: string,
  ) {
    return this.canteen.archiveProduct(request.user.subject, productId);
  }
}

import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';

import type { AuthenticatedRequest } from '../../auth/authenticated-request';

import { CanteenService } from './canteen.service';

@Controller('canteen')
export class CanteenController {
  constructor(private readonly canteen: CanteenService) {}

  @Get('catalog')
  getCatalog() {
    return this.canteen.getCustomerCatalog();
  }

  @Get('orders')
  listOrders(@Req() request: AuthenticatedRequest) {
    return this.canteen.listCustomerOrders(request.user.subject);
  }

  @Post('orders')
  placeOrder(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.canteen.placeOrder(request.user.subject, body);
  }

  @Post('orders/:orderId/cancel')
  cancelOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return this.canteen.cancelCustomerOrder(request.user.subject, orderId);
  }
}

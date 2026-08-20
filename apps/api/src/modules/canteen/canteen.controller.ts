import { Controller, Get } from '@nestjs/common';

import { CanteenService } from './canteen.service';

@Controller('canteen')
export class CanteenController {
  constructor(private readonly canteen: CanteenService) {}

  @Get('catalog')
  getCatalog() {
    return this.canteen.getCustomerCatalog();
  }
}

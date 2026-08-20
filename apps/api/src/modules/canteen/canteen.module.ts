import { Module } from '@nestjs/common';

import { WalletModule } from '../wallet/wallet.module';
import { CanteenManagementController } from './canteen-management.controller';
import { CanteenOrderRepository } from './canteen-order.repository';
import { CanteenController } from './canteen.controller';
import { CanteenRepository } from './canteen.repository';
import { CanteenService } from './canteen.service';

@Module({
  imports: [WalletModule],
  controllers: [CanteenController, CanteenManagementController],
  providers: [CanteenRepository, CanteenOrderRepository, CanteenService],
  exports: [CanteenService],
})
export class CanteenModule {}

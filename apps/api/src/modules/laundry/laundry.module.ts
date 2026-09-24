import { Module } from '@nestjs/common';

import { WalletModule } from '../wallet/wallet.module';
import { LaundryManagementController } from './laundry-management.controller';
import { LaundryController } from './laundry.controller';
import { LaundryRepository } from './laundry.repository';
import { LaundryService } from './laundry.service';

@Module({
  imports: [WalletModule],
  controllers: [LaundryController, LaundryManagementController],
  providers: [LaundryRepository, LaundryService],
})
export class LaundryModule {}

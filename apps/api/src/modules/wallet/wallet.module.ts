import { Module } from '@nestjs/common';

import { CashierWalletController } from './cashier-wallet.controller';
import { WalletController } from './wallet.controller';
import { WalletRepository } from './wallet.repository';
import { WalletService } from './wallet.service';

@Module({
  controllers: [WalletController, CashierWalletController],
  providers: [WalletRepository, WalletService],
  exports: [WalletRepository, WalletService],
})
export class WalletModule {}

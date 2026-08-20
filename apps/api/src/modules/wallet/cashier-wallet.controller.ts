import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';

import type { AuthenticatedRequest } from '../../auth/authenticated-request';
import { RequireRoles } from '../../auth/roles.decorator';
import { WalletService } from './wallet.service';

@RequireRoles('wallet_cashier')
@Controller('wallet/cashier')
export class CashierWalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get('accounts')
  searchAccounts(@Query('phone') phone: unknown) {
    return this.wallet.searchAccounts(phone);
  }

  @Get('accounts/:accountId')
  getAccount(@Param('accountId') accountId: string) {
    return this.wallet.getCashierAccount(accountId);
  }

  @Post('deposits')
  createCashDeposit(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.wallet.createCashDeposit(request.user.subject, body);
  }

  @Post('deposits/:entryId/reverse')
  reverseCashDeposit(
    @Req() request: AuthenticatedRequest,
    @Param('entryId') entryId: string,
    @Body() body: unknown,
  ) {
    return this.wallet.reverseCashDeposit(request.user.subject, entryId, body);
  }
}

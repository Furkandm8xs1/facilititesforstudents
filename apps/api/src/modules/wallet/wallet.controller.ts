import { Controller, Get, Req } from '@nestjs/common';

import type { AuthenticatedRequest } from '../../auth/authenticated-request';
import { WalletService } from './wallet.service';

@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get('me')
  getMine(@Req() request: AuthenticatedRequest) {
    return this.wallet.getMine(request.user.subject);
  }
}

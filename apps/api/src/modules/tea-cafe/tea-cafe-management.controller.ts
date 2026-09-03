import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../../auth/authenticated-request';
import { RequireRoles } from '../../auth/roles.decorator';
import { TeaCafeService } from './tea-cafe.service';

@RequireRoles('tea_cafe_attendant')
@Controller('tea-cafe/manage')
export class TeaCafeManagementController {
  constructor(private readonly teaCafe: TeaCafeService) {}

  @Get('brews')
  listBrews() {
    return this.teaCafe.listBrews();
  }

  @Post('brews')
  createBrew(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.teaCafe.createBrew(request.user.subject, body);
  }

  @Delete('brews/:brewId')
  deleteBrew(
    @Req() request: AuthenticatedRequest,
    @Param('brewId') brewId: string,
  ) {
    return this.teaCafe.deleteBrew(request.user.subject, brewId);
  }
}

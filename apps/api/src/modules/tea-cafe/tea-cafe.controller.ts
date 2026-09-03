import { Controller, Get } from '@nestjs/common';

import { TeaCafeService } from './tea-cafe.service';

@Controller('tea-cafe')
export class TeaCafeController {
  constructor(private readonly teaCafe: TeaCafeService) {}

  @Get('brews')
  listBrews() {
    return this.teaCafe.listBrews();
  }
}

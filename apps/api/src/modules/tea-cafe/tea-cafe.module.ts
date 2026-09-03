import { Module } from '@nestjs/common';

import { TeaCafeManagementController } from './tea-cafe-management.controller';
import { TeaCafeController } from './tea-cafe.controller';
import { TeaCafeRepository } from './tea-cafe.repository';
import { TeaCafeService } from './tea-cafe.service';

@Module({
  controllers: [TeaCafeController, TeaCafeManagementController],
  providers: [TeaCafeRepository, TeaCafeService],
})
export class TeaCafeModule {}

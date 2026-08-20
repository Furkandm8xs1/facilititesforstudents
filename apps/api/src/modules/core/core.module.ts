import { Module } from '@nestjs/common';

import { MeController } from './me.controller';
import { UserProfileRepository } from './user-profile.repository';

@Module({
  controllers: [MeController],
  providers: [UserProfileRepository],
  exports: [UserProfileRepository],
})
export class CoreModule {}

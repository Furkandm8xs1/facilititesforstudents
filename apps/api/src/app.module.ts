import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { CanteenModule } from './modules/canteen/canteen.module';
import { CoreModule } from './modules/core/core.module';
import { WalletModule } from './modules/wallet/wallet.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    AuthModule,
    DatabaseModule,
    CoreModule,
    WalletModule,
    CanteenModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

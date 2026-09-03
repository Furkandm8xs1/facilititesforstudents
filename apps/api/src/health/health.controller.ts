import { Controller, Get } from '@nestjs/common';

import { Public } from '../auth/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'hizmet-api',
      architecture: 'modular-monolith',
      modules: ['core', 'wallet', 'canteen', 'tea-cafe'],
    } as const;
  }
}

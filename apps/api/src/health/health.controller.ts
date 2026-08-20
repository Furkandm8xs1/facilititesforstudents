import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'hizmet-api',
      architecture: 'modular-monolith',
      modules: ['core', 'wallet', 'canteen'],
    } as const;
  }
}

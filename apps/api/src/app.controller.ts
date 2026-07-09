import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Home y health son públicos (accesibles por invitados / monitorización). Con
  // el JwtAuthGuard global hay que marcarlos explícitamente.
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('health')
  health() {
    return this.appService.health();
  }
}

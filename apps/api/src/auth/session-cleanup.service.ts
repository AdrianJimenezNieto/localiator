import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessionService } from './session.service';

// Tarea programada que barre los refresh tokens caducados una vez al día. Se
// eligió el cron (frente a la limpieza "oportunista" al fallar una renovación)
// porque mantiene la tabla pequeña de forma predecible, sin depender de que los
// usuarios pasen por /auth/refresh.
//
// Requiere ScheduleModule.forRoot() en AppModule (@nestjs/schedule).
@Injectable()
export class SessionCleanupService {
  private readonly logger = new Logger(SessionCleanupService.name);

  constructor(private readonly session: SessionService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanup(): Promise<void> {
    const deleted = await this.session.deleteExpired();
    if (deleted > 0) {
      this.logger.log(
        `Limpieza de sesiones: ${deleted} refresh tokens caducados eliminados.`,
      );
    }
  }
}

import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationQueryDto } from './dto/reconciliation-query.dto';

// Informe de conciliación, SOLO admin. Herramienta de soporte que el admin lanza
// cuando quiere, no un endpoint público ni un job automático (eso se puede añadir
// luego sin rehacer la lógica de cotejo).
@Controller('admin/reconciliation')
@Roles(Role.ADMIN)
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get()
  reconcile(@Query() query: ReconciliationQueryDto) {
    return this.reconciliation.reconcile(query);
  }
}

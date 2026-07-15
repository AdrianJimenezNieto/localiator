import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/jwt.strategy';
import { AuctionsService } from './auctions.service';
import { PlaceBidDto } from './dto/place-bid.dto';
import { ListAuctionsDto } from './dto/list-auctions.dto';

// Cara PÚBLICA + pujas de las subastas. La gestión (alta, edición, cancelación) va
// en auctions.admin.controller.ts, bajo `admin/auctions` y con @Roles(ADMIN).
//
// El listado público (tarea 12) vive aquí y no en catalog.controller.ts (la fachada
// pública del catálogo) para mantener las subastas autocontenidas: meterlo allí
// obligaría al módulo de catálogo a conocer pujas y estados de subasta.
//
// OJO con los roles: aquí NO hay @Roles a nivel de clase, se marca ruta por ruta.
// Es a propósito y no es un descuido. RolesGuard no mira @Public(): si la clase
// llevara @Roles(BUYER, ADMIN), la ruta pública seguiría viendo ese requisito y,
// como @Public() hace que JwtAuthGuard no rellene `req.user`, el guard devolvería
// 403 a los invitados. Mismo patrón que category.controller.ts (público + admin en
// el mismo controlador). El "denegar por defecto" lo sigue garantizando el
// JwtAuthGuard global: sin @Public(), una ruta exige token igualmente.
@Controller('auctions')
export class AuctionsController {
  constructor(private readonly auctions: AuctionsService) {}

  // Listado público y paginado: lo que permite descubrir las subastas sin cuenta.
  @Public()
  @Get()
  list(@Query() query: ListAuctionsDto) {
    return this.auctions.listPublicAuctions(query);
  }

  // Registra una puja. Recibe solo el importe; el usuario sale del JWT y la
  // subasta de la ruta. Las reglas (precio de salida, incremento, ventana) las
  // aplica el servicio. Pujar exige cuenta con email verificado (lo valida el
  // servicio); el invitado puede mirar pero no pujar (coherente con CLAUDE.md).
  // El canal en vivo (tarea 03) reutiliza el mismo AuctionsService.placeBid.
  @Roles(Role.BUYER, Role.ADMIN)
  @Post(':id/bids')
  placeBid(
    @Param('id') auctionId: string,
    @Body() dto: PlaceBidDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.auctions.placeBid(auctionId, user.userId, dto);
  }
}

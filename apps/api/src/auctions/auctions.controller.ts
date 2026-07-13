import { Body, Controller, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/jwt.strategy';
import { AuctionsService } from './auctions.service';
import { PlaceBidDto } from './dto/place-bid.dto';

// Pujas sobre una subasta. Pujar exige cuenta con email verificado (lo valida el
// servicio); el invitado puede mirar pero no pujar (coherente con CLAUDE.md). El
// canal en vivo (tarea 03) reutilizará el mismo AuctionsService.placeBid.
@Controller('auctions')
@Roles(Role.BUYER, Role.ADMIN)
export class AuctionsController {
  constructor(private readonly auctions: AuctionsService) {}

  // Registra una puja. Recibe solo el importe; el usuario sale del JWT y la
  // subasta de la ruta. Las reglas (precio de salida, incremento, ventana) las
  // aplica el servicio.
  @Post(':id/bids')
  placeBid(
    @Param('id') auctionId: string,
    @Body() dto: PlaceBidDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.auctions.placeBid(auctionId, user.userId, dto);
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuctionStatus, Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { AuctionsService } from './auctions.service';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { UpdateAuctionDto } from './dto/update-auction.dto';

// Gestión de subastas: alta, edición y cancelación, solo para ADMIN (tarea 11).
//
// Vive en un controlador APARTE de auctions.controller.ts a propósito. Aquel tiene
// `@Roles(BUYER, ADMIN)` a nivel de clase (pujar) y mezclar aquí las rutas de admin
// obligaría a repetir el rol ruta por ruta, que es la forma habitual de acabar
// publicando una ruta de admin por despiste. El catálogo ya separa igual lo interno
// (product.controller) de lo público (catalog.controller).
//
// El prefijo `admin/auctions` evita además colisionar con `POST /auctions/:id/bids`.
@Controller('admin/auctions')
@Roles(Role.ADMIN)
export class AuctionsAdminController {
  constructor(private readonly auctions: AuctionsService) {}

  // Listado del backoffice. `status` opcional para filtrar por estado; el pipe lo
  // valida contra el enum, así que un valor inventado da 400 en vez de llegar a
  // Prisma y reventar con un error opaco.
  @Get()
  list(
    @Query('status', new ParseEnumPipe(AuctionStatus, { optional: true }))
    status?: AuctionStatus,
  ) {
    return this.auctions.listAuctionsForAdmin(status);
  }

  @Post()
  create(@Body() dto: CreateAuctionDto) {
    return this.auctions.createAuction(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAuctionDto) {
    return this.auctions.updateAuction(id, dto);
  }

  // Cancelar es un POST y no un DELETE: la subasta no se borra (su historial de
  // pujas es un registro que queremos conservar), cambia de estado a CANCELLED.
  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.auctions.cancelAuction(id);
  }
}

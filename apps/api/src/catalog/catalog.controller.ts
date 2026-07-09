import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { CatalogService } from './catalog.service';
import { ListCatalogDto } from './dto/list-catalog.dto';

// Catálogo PÚBLICO (rol invitado, sin login): lo consume el frontend para pintar
// las tarjetas. Rutas separadas producto/lote (más simple de paginar/cachear que
// un listado unificado con orden y total mezclados).
@Controller('catalog')
@Public()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products')
  listProducts(@Query() query: ListCatalogDto) {
    return this.catalog.listProducts(query);
  }

  @Get('lots')
  listLots(@Query() query: ListCatalogDto) {
    return this.catalog.listLots(query);
  }
}

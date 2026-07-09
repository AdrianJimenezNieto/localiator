import { Controller, Get, Param, Query } from '@nestjs/common';
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

  // Ficha por id (acceso por slug se pospone a la tarea de SEO en Fase 4). Rutas
  // DESPUÉS de las de listado para que 'products'/'lots' no capturen /products/:id
  // por accidente (aunque el path distinto ya las separa).
  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    return this.catalog.getProduct(id);
  }

  @Get('lots/:id')
  getLot(@Param('id') id: string) {
    return this.catalog.getLot(id);
  }
}

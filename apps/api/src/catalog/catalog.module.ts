import { Module } from '@nestjs/common';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { LotController } from './lot.controller';
import { LotService } from './lot.service';

// Módulo raíz del catálogo. Agrupa categorías, productos y lotes: así el catálogo
// no se fragmenta en un módulo por entidad.
@Module({
  controllers: [CategoryController, ProductController, LotController],
  providers: [CategoryService, ProductService, LotService],
})
export class CatalogModule {}

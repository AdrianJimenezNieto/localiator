import { Module } from '@nestjs/common';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { LotController } from './lot.controller';
import { LotService } from './lot.service';
import { UploadController } from './upload.controller';
import { StorageService } from './storage.service';

// Módulo raíz del catálogo. Agrupa categorías, productos, lotes y la subida de
// fotos: así el catálogo no se fragmenta en un módulo por entidad.
@Module({
  controllers: [
    CategoryController,
    ProductController,
    LotController,
    UploadController,
  ],
  providers: [CategoryService, ProductService, LotService, StorageService],
})
export class CatalogModule {}

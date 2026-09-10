import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { LotController } from './lot.controller';
import { LotService } from './lot.service';
import { UploadController } from './upload.controller';
import { StorageService } from './storage.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

// Módulo raíz del catálogo. Agrupa la gestión de admin (productos, lotes, fotos)
// y el listado público (CatalogController): así el catálogo no se fragmenta en un
// módulo por entidad.
@Module({
  controllers: [
    ProductController,
    LotController,
    UploadController,
    CatalogController,
  ],
  providers: [ProductService, LotService, StorageService, CatalogService],
})
export class CatalogModule {}

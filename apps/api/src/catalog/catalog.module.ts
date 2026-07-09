import { Module } from '@nestjs/common';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

// Módulo raíz del catálogo. Agrupa categorías y productos (y, en tareas
// siguientes, lotes): así el catálogo no se fragmenta en un módulo por entidad.
@Module({
  controllers: [CategoryController, ProductController],
  providers: [CategoryService, ProductService],
})
export class CatalogModule {}

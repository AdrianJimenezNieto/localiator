import { Module } from '@nestjs/common';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';

// Módulo raíz del catálogo. Agrupa categorías (aquí) y, en tareas siguientes,
// productos y lotes: así el catálogo no se fragmenta en un módulo por entidad.
@Module({
  controllers: [CategoryController],
  providers: [CategoryService],
})
export class CatalogModule {}

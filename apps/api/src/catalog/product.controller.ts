import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/jwt.strategy';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

// Gestión de productos: todo el CRUD es solo de admin. El listado y la ficha
// PÚBLICOS del catálogo (invitado) llegan en tareas aparte (06/08) con sus propias
// rutas bajo /catalog, para no mezclar lo interno con lo público.
@Controller('products')
@Roles(Role.ADMIN)
export class ProductController {
  constructor(private readonly products: ProductService) {}

  @Get()
  listAll() {
    return this.products.listAll();
  }

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.products.update(id, dto, user.userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.products.remove(id);
  }
}

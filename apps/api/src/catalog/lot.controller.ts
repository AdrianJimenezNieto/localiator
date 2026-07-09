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
import { LotService } from './lot.service';
import { CreateLotDto } from './dto/create-lot.dto';
import { UpdateLotDto } from './dto/update-lot.dto';

// Gestión de lotes: CRUD solo de admin, espejo del de productos. El listado y la
// ficha públicos del catálogo llegan en 06/08.
@Controller('lots')
@Roles(Role.ADMIN)
export class LotController {
  constructor(private readonly lots: LotService) {}

  @Post()
  create(@Body() dto: CreateLotDto) {
    return this.lots.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.lots.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLotDto) {
    return this.lots.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.lots.remove(id);
  }
}

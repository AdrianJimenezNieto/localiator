import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { StorageService } from './storage.service';
import type { UploadedFileLike } from './storage.service';

// Subida de fotos del catálogo. Solo admin. Devuelve la URL estable para que el
// cliente la añada al array `photos` del producto/lote vía el PATCH de 02/03.
@Controller('uploads')
@Roles(Role.ADMIN)
export class UploadController {
  constructor(private readonly storage: StorageService) {}

  // FileInterceptor sin destino usa memoryStorage → el archivo llega en `buffer`,
  // que validamos (magic bytes) antes de tocar el disco. El límite de tamaño aquí
  // es una primera barrera; StorageService lo revalida (defensa en profundidad).
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: UploadedFileLike) {
    const url = await this.storage.save(file);
    return { url };
  }
}

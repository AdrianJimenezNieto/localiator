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
  //
  // `limits` NO es opcional con memoryStorage: sin él multer no tiene tope y se
  // traga el cuerpo ENTERO en RAM antes de que nadie lo mire, así que la
  // validación de tamaño de StorageService llegaba tarde —un admin con la sesión
  // robada (o un fallo de red) podía tumbar el proceso subiendo un fichero
  // gigante. Con `limits`, multer aborta el stream en cuanto se pasa.
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        // Mismo tope que StorageService (MAX_UPLOAD_BYTES), con holgura por si se
        // sube por .env; el servicio sigue siendo la comprobación autoritativa.
        fileSize: Number(process.env.MAX_UPLOAD_BYTES ?? 5_000_000),
        files: 1, // un solo archivo por petición
        fields: 5, // campos de texto sueltos: no necesitamos más
      },
    }),
  )
  async upload(@UploadedFile() file: UploadedFileLike) {
    const url = await this.storage.save(file);
    return { url };
  }
}

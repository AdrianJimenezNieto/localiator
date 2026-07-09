import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Tipo de imagen permitido y su firma (magic bytes) al inicio del archivo. Validar
// la firma REAL —no la extensión ni el mimetype que manda el cliente, ambos
// falsificables— es lo que impide colar un ejecutable renombrado a .jpg.
interface AllowedType {
  ext: string;
  mime: string;
  matches: (buffer: Buffer) => boolean;
}

const ALLOWED_TYPES: AllowedType[] = [
  {
    ext: 'jpg',
    mime: 'image/jpeg',
    matches: (b) =>
      b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: 'png',
    mime: 'image/png',
    // \x89PNG\r\n\x1a\n
    matches: (b) =>
      b.length > 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47,
  },
  {
    ext: 'webp',
    mime: 'image/webp',
    // "RIFF"...."WEBP"
    matches: (b) =>
      b.length > 12 &&
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP',
  },
];

// Archivo tal y como lo entrega multer (memoryStorage): el contenido en `buffer`.
export interface UploadedFileLike {
  buffer: Buffer;
  size: number;
  originalname: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  // Directorio físico donde se guardan las fotos. En dev es una carpeta local
  // (gitignored); en producción será un volumen Docker (persistencia). Resuelto a
  // ruta absoluta para no depender del cwd.
  private readonly uploadDir: string;
  private readonly maxBytes: number;
  // Base pública para construir la URL servida. La subida devuelve una URL absoluta
  // para que encaje con la validación @IsUrl de las fotos de producto/lote.
  private readonly publicBaseUrl: string;

  // Prefijo bajo el que main.ts sirve el directorio como estático.
  static readonly PUBLIC_PATH = '/uploads';

  constructor(config: ConfigService) {
    this.uploadDir = resolve(config.get<string>('UPLOAD_DIR') ?? 'uploads');
    this.maxBytes = Number(config.get<string>('MAX_UPLOAD_BYTES') ?? 5_000_000);
    this.publicBaseUrl = (
      config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  // Valida y persiste un archivo, devolviendo su URL pública estable.
  async save(file: UploadedFileLike | undefined): Promise<string> {
    if (!file?.buffer) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    if (file.size > this.maxBytes) {
      throw new PayloadTooLargeException(
        `El archivo supera el máximo de ${this.maxBytes} bytes`,
      );
    }

    const type = ALLOWED_TYPES.find((t) => t.matches(file.buffer));
    if (!type) {
      throw new BadRequestException(
        'Tipo de archivo no permitido (solo JPEG, PNG o WebP)',
      );
    }

    // Nombre REGENERADO (uuid): nunca el nombre del cliente → evita path traversal
    // y colisiones.
    const filename = `${randomUUID()}.${type.ext}`;
    await mkdir(this.uploadDir, { recursive: true });
    await writeFile(join(this.uploadDir, filename), file.buffer);

    return `${this.publicBaseUrl}${StorageService.PUBLIC_PATH}/${filename}`;
  }

  // Borra el archivo físico asociado a una URL previamente devuelta por save(). Se
  // usa al quitar una foto del array de un producto/lote. Tolerante: si el archivo
  // ya no existe, no revienta (log y seguir).
  async removeByUrl(url: string): Promise<void> {
    const marker = `${StorageService.PUBLIC_PATH}/`;
    const index = url.indexOf(marker);
    if (index === -1) {
      return; // No es una URL nuestra (p. ej. una foto externa): nada que borrar.
    }
    const filename = url.slice(index + marker.length);
    // Blindaje anti path traversal: solo el nombre de archivo, sin separadores.
    if (!filename || filename.includes('/') || filename.includes('..')) {
      return;
    }
    try {
      await unlink(join(this.uploadDir, filename));
    } catch (error) {
      this.logger.warn(
        `No se pudo borrar la foto ${filename}: ${String(error)}`,
      );
    }
  }
}

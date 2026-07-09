import { readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService, UploadedFileLike } from './storage.service';

// Config de prueba: dir temporal aislado y un tope de tamaño pequeño para ejercer
// el 413 sin manejar megabytes.
const TEST_DIR = join(tmpdir(), `localiator-uploads-test-${process.pid}`);
const config = {
  get: (key: string) => {
    const values: Record<string, string> = {
      UPLOAD_DIR: TEST_DIR,
      MAX_UPLOAD_BYTES: '1000',
      API_PUBLIC_URL: 'http://localhost:3000',
    };
    return values[key];
  },
} as unknown as ConfigService;

// Cabeceras (magic bytes) mínimas de cada formato.
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function fileFrom(buffer: Buffer): UploadedFileLike {
  return { buffer, size: buffer.length, originalname: 'foto.png' };
}

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    service = new StorageService(config);
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('guarda un PNG válido y devuelve una URL bajo /uploads', async () => {
    const url = await service.save(fileFrom(PNG_HEADER));

    expect(url).toMatch(/^http:\/\/localhost:3000\/uploads\/[\w-]+\.png$/);
    // El archivo existe físicamente con un nombre regenerado (no el del cliente).
    const files = await readdir(TEST_DIR);
    expect(files.some((f) => f.endsWith('.png') && !f.includes('foto'))).toBe(
      true,
    );
  });

  it('reconoce el JPEG por su firma y le pone extensión .jpg', async () => {
    const url = await service.save(fileFrom(JPEG_HEADER));
    expect(url).toMatch(/\.jpg$/);
  });

  it('rechaza con 400 un archivo cuyo contenido no es una imagen permitida', async () => {
    const notImage = Buffer.from('GIF89a fake', 'ascii');
    await expect(service.save(fileFrom(notImage))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rechaza con 413 un archivo que supera el tamaño máximo', async () => {
    const big = Buffer.concat([PNG_HEADER, Buffer.alloc(2000)]);
    await expect(service.save(fileFrom(big))).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
  });

  it('rechaza con 400 si no llega archivo', async () => {
    await expect(service.save(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

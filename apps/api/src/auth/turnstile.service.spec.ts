import { ConfigService } from '@nestjs/config';
import { TurnstileService } from './turnstile.service';

function makeService(secret: string | undefined) {
  const config = { get: () => secret } as unknown as ConfigService;
  return new TurnstileService(config);
}

describe('TurnstileService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sin secret key (dev): no bloquea, devuelve true', async () => {
    const service = makeService(undefined);
    await expect(service.verify(undefined)).resolves.toBe(true);
  });

  it('con secret pero sin token: false', async () => {
    const service = makeService('secret');
    await expect(service.verify(undefined)).resolves.toBe(false);
  });

  it('token válido según Cloudflare: true', async () => {
    const service = makeService('secret');
    jest.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    } as Response);

    await expect(service.verify('tok', '1.2.3.4')).resolves.toBe(true);
  });

  it('token rechazado por Cloudflare: false', async () => {
    const service = makeService('secret');
    jest.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ success: false }),
    } as Response);

    await expect(service.verify('tok')).resolves.toBe(false);
  });

  it('fallo de red: fail-closed (false)', async () => {
    const service = makeService('secret');
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network'));

    await expect(service.verify('tok')).resolves.toBe(false);
  });
});

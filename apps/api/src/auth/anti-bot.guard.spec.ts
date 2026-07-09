import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { AntiBotGuard, HONEYPOT_FIELD } from './anti-bot.guard';
import { TurnstileService } from './turnstile.service';

function contextWith(body: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ body, ip: '1.2.3.4' }) }),
  } as unknown as ExecutionContext;
}

describe('AntiBotGuard', () => {
  const verify = jest.fn();
  const turnstile = { verify } as unknown as TurnstileService;
  const guard = new AntiBotGuard(turnstile);

  beforeEach(() => jest.clearAllMocks());

  it('rechaza si el honeypot llega relleno (bot)', async () => {
    await expect(
      guard.canActivate(contextWith({ [HONEYPOT_FIELD]: 'http://spam' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Ni siquiera llega a verificar Turnstile: es la comprobación más barata.
    expect(verify).not.toHaveBeenCalled();
  });

  it('rechaza si Turnstile no valida', async () => {
    verify.mockResolvedValue(false);
    await expect(
      guard.canActivate(contextWith({ turnstileToken: 'bad' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('permite si el honeypot está vacío y Turnstile valida', async () => {
    verify.mockResolvedValue(true);
    await expect(
      guard.canActivate(
        contextWith({ [HONEYPOT_FIELD]: '', turnstileToken: 'ok' }),
      ),
    ).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('ok', '1.2.3.4');
  });
});

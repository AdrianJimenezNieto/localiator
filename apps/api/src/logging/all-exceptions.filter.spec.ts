import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

// Monta un ArgumentsHost falso con req (incluido req.log de pino) y res espiado.
function makeHost(): {
  host: ArgumentsHost;
  res: { status: jest.Mock; json: jest.Mock };
  log: { error: jest.Mock; warn: jest.Mock };
} {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const res = { status, json };
  const log = { error: jest.fn(), warn: jest.fn() };
  const req = { method: 'GET', url: '/x', id: 'req-1', log };
  const host = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
  return { host, res, log };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('respeta el status y el mensaje de una HttpException y lo loguea como warn', () => {
    const { host, res, log } = makeHost();

    filter.catch(new BadRequestException('email inválido'), host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'email inválido' }),
    );
    expect(log.warn).toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it('para un error inesperado devuelve 500 genérico (sin filtrar detalles) y loguea error', () => {
    const { host, res, log } = makeHost();

    filter.catch(new Error('detalle interno con secretos'), host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Error interno del servidor',
      requestId: 'req-1',
    });
    // El detalle interno nunca se envía al cliente; solo va al log de error.
    expect(log.error).toHaveBeenCalled();
  });
});

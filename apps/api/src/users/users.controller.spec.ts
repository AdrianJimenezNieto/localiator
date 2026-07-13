import { Test } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import type { RequestUser } from '../auth/jwt.strategy';

describe('UsersController', () => {
  let controller: UsersController;
  const usersMock = { anonymizeOwnAccount: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersMock }],
    }).compile();
    controller = moduleRef.get(UsersController);
  });

  // Garantía de seguridad: DELETE /users/me anonimiza SIEMPRE al usuario
  // autenticado (@CurrentUser), nunca a otro. No hay forma de pasar un id ajeno.
  it('anonimiza únicamente la cuenta del usuario autenticado', () => {
    const current: RequestUser = {
      userId: 'u1',
      email: 'u1@correo.dev',
      role: 'BUYER',
    };

    void controller.deleteMe(current);

    expect(usersMock.anonymizeOwnAccount).toHaveBeenCalledWith('u1');
    expect(usersMock.anonymizeOwnAccount).toHaveBeenCalledTimes(1);
  });
});

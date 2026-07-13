import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// PrismaModule es global, no hace falta importarlo. La revocación de sesiones se
// hace inline en la transacción del service (atomicidad), por eso no dependemos de
// SessionService/AuthModule.
@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}

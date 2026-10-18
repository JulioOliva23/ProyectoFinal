import { Module } from '@nestjs/common';
import { UserRepository } from './repositories/user.repository';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// Auth & RBAC: user accounts. AuthModule consumes UserRepository for
// credential checks; other modules use UsersService.
@Module({
  controllers: [UsersController],
  providers: [UserRepository, UsersService],
  exports: [UserRepository, UsersService],
})
export class UsersModule {}

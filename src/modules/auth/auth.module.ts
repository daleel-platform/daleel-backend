import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordResetController } from './password-reset.controller.js';
import { PasswordResetService } from './password-reset.service.js';
import { PasswordResetDeliveryService } from './password-reset-delivery.service.js';

@Module({
  imports: [JwtModule.register({}), UsersModule],
  controllers: [AuthController, PasswordResetController],
  providers: [AuthService, PasswordResetService, PasswordResetDeliveryService],
})
export class AuthModule {}

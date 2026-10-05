import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { UsersService } from '../users/users.service.js';
import { PasswordResetDeliveryService } from './password-reset-delivery.service.js';
import { PasswordResetResponseDto } from './dto/password-reset-response.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';

const REQUEST_MESSAGE =
  'If an account exists with this email, a password reset link has been sent.';

@Injectable()
export class PasswordResetService {
  constructor(
    private users: UsersService,
    private config: ConfigService,
    private delivery: PasswordResetDeliveryService,
  ) {}

  async requestReset(email: string): Promise<PasswordResetResponseDto> {
    const user = await this.users.findByEmail(email);
    if (user) {
      const token = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      await this.users.setPasswordResetToken(
        user.id,
        tokenHash,
        new Date(
          Date.now() +
            this.config.getOrThrow<number>('PASSWORD_RESET_EXPIRES_IN') * 1000,
        ),
      );
      await this.delivery.send(user.email, token);
    }
    return { message: REQUEST_MESSAGE };
  }

  async resetPassword(
    dto: ResetPasswordDto,
  ): Promise<PasswordResetResponseDto> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const passwordHash = await hash(
      dto.password,
      this.config.getOrThrow<number>('BCRYPT_SALT_ROUNDS'),
    );
    const updated = await this.users.resetPasswordWithToken(
      tokenHash,
      passwordHash,
    );
    if (!updated) {
      throw new BadRequestException('Invalid or expired password reset token');
    }
    return { message: 'Password reset successfully.' };
  }
}

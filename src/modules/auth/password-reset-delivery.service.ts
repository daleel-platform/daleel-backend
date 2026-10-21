import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service.js';
@Injectable()
export class PasswordResetDeliveryService {
  private readonly logger = new Logger(PasswordResetDeliveryService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async send(email: string, token: string, name?: string): Promise<void> {
    const url = new URL(
      this.config.get<string>(
        'PASSWORD_RESET_URL',
        'http://localhost:3000/reset-password',
      ),
    );
    url.searchParams.set('token', token);
    const expirySeconds = this.config.getOrThrow<number>(
      'PASSWORD_RESET_EXPIRES_IN',
    );

    const expiryMinutes = Math.ceil(expirySeconds / 60);

    await this.mailService.sendPasswordResetEmail(
      email,
      url.toString(),
      expiryMinutes,
      name,
    );
  }
}

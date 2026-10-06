import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PasswordResetDeliveryService {
  private readonly logger = new Logger(PasswordResetDeliveryService.name);

  constructor(private readonly config: ConfigService) {}

  async send(email: string, token: string): Promise<void> {
    const url = new URL(
      this.config.get<string>(
        'PASSWORD_RESET_URL',
        'http://localhost:3000/reset-password',
      ),
    );
    url.searchParams.set('token', token);
    this.logger.log(
      'Local password reset for ' + email + ': ' + url.toString(),
    );
  }
}

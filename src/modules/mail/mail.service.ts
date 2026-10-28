import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import type { PasswordResetEmailContext } from './mail.types.js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async sendPasswordResetEmail(
    to: string,
    resetUrl: string,
    expiryMinutes: number,
    name?: string,
  ): Promise<void> {
    const recipientName = name || 'there';

    const plainText = [
      `Hello ${recipientName},`,
      '',
      'We received a request to reset the password for your Daleel account.',
      '',
      'To create a new password, open the link below:',
      resetUrl,
      '',
      `For your security, this link will expire in ${expiryMinutes} minutes.`,
      '',
      "If you didn't request a password reset, you can safely ignore this email.",
      '',
      'Best regards,',
      'The Daleel Team',
    ].join('\n');

    const context: PasswordResetEmailContext = {
      name: recipientName,
      resetUrl,
      expiryMinutes,
    };

    const result = await this.mailerService.sendMail({
      to,
      subject: 'Reset Your Password – Daleel',
      template: 'password-reset',
      context,
      text: plainText,
    });
    const isDevelopment =
      this.configService.get<string>('NODE_ENV') === 'development';

    const smtpConfigured =
      Boolean(this.configService.get<string>('SMTP_HOST')) &&
      this.configService.get<number>('SMTP_PORT') !== undefined &&
      Boolean(this.configService.get<string>('SMTP_USER')) &&
      Boolean(this.configService.get<string>('SMTP_PASSWORD')) &&
      Boolean(this.configService.get<string>('SMTP_FROM'));

    if (isDevelopment && !smtpConfigured) {
      this.logger.log(`Development reset email: ${result.message}`);
    }
  }
}

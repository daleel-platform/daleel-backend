import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import type { PasswordResetEmailContext } from './mail.types.js';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

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

    await this.mailerService.sendMail({
      to,
      subject: 'Reset Your Password – Daleel',
      template: 'password-reset',
      context,
      text: plainText,
    });
  }
}

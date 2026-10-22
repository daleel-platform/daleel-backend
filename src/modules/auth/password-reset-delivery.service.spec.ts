import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { MailService } from '../mail/mail.service.js';
import { PasswordResetDeliveryService } from './password-reset-delivery.service.js';

describe('PasswordResetDeliveryService', () => {
  it('sends a password reset email with the configured URL', async () => {
    const sendPasswordResetEmail = vi.fn().mockResolvedValue(undefined);

    const config = new ConfigService({
      PASSWORD_RESET_URL: 'http://localhost:4200/reset-password',
      PASSWORD_RESET_EXPIRES_IN: 900,
    });

    const mailService = {
      sendPasswordResetEmail,
    } as unknown as MailService;

    const service = new PasswordResetDeliveryService(config, mailService);

    await service.send('test@example.com', 'abc', 'Test User');

    expect(sendPasswordResetEmail).toHaveBeenCalledExactlyOnceWith(
      'test@example.com',
      'http://localhost:4200/reset-password?token=abc',
      15,
      'Test User',
    );
  });

  it('uses the default reset URL when none is configured', async () => {
    const sendPasswordResetEmail = vi.fn().mockResolvedValue(undefined);

    const config = new ConfigService({
      PASSWORD_RESET_EXPIRES_IN: 1800,
    });

    const mailService = {
      sendPasswordResetEmail,
    } as unknown as MailService;

    const service = new PasswordResetDeliveryService(config, mailService);

    await service.send('test@example.com', 'secret');

    expect(sendPasswordResetEmail).toHaveBeenCalledExactlyOnceWith(
      'test@example.com',
      'http://localhost:3000/reset-password?token=secret',
      30,
      undefined,
    );
  });
});

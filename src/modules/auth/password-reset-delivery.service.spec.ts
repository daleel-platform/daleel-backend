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

  it('throws an error when PASSWORD_RESET_URL is not configured', async () => {
    const sendPasswordResetEmail = vi.fn();

    const config = new ConfigService({
      PASSWORD_RESET_EXPIRES_IN: 1800,
    });

    const mailService = {
      sendPasswordResetEmail,
    } as unknown as MailService;

    const service = new PasswordResetDeliveryService(config, mailService);

    await expect(service.send('test@example.com', 'secret')).rejects.toThrow(
      'PASSWORD_RESET_URL',
    );

    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

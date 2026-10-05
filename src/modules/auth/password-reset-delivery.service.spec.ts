import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasswordResetDeliveryService } from './password-reset-delivery.service.js';

describe('PasswordResetDeliveryService', () => {
  afterEach(() => vi.restoreAllMocks());
  it('logs the local link using the configured reset page', async () => {
    const log = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const service = new PasswordResetDeliveryService(
      new ConfigService({
        NODE_ENV: 'development',
        PASSWORD_RESET_URL: 'http://localhost:4200/reset-password',
      }),
    );
    await service.send('test@example.com', 'abc');
    expect(log).toHaveBeenCalledWith(
      'Local password reset for test@example.com: http://localhost:4200/reset-password?token=abc',
    );
  });
  it('logs reset links without an environment restriction', async () => {
    const log = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const service = new PasswordResetDeliveryService(
      new ConfigService({ NODE_ENV: 'production' }),
    );
    await service.send('test@example.com', 'secret');
    expect(log).toHaveBeenCalledWith(
      'Local password reset for test@example.com: http://localhost:3000/reset-password?token=secret',
    );
  });
});

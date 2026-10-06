import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { compare, hash } from 'bcryptjs';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from '../users/users.service.js';
import { PasswordResetDeliveryService } from './password-reset-delivery.service.js';
import { PasswordResetService } from './password-reset.service.js';

vi.mock('bcryptjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bcryptjs')>();
  return { ...actual, hash: vi.fn(actual.hash) };
});

describe('PasswordResetService', () => {
  let service: PasswordResetService;
  const users = {
    findByEmail: vi.fn(),
    setPasswordResetToken: vi.fn(),
    hasValidPasswordResetToken: vi.fn(),
    resetPasswordWithToken: vi.fn(),
  };
  const delivery = { send: vi.fn() };
  beforeEach(async () => {
    vi.clearAllMocks();
    users.hasValidPasswordResetToken.mockResolvedValue(true);
    const module = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        { provide: UsersService, useValue: users },
        { provide: PasswordResetDeliveryService, useValue: delivery },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key === 'PASSWORD_RESET_EXPIRES_IN') return 900;
              if (key === 'BCRYPT_SALT_ROUNDS') return 4;
              throw new Error('Unexpected config key: ' + key);
            },
          },
        },
      ],
    }).compile();
    service = module.get(PasswordResetService);
  });

  it('returns the same message for existing and unknown accounts without disclosing tokens', async () => {
    users.findByEmail
      .mockResolvedValueOnce({ id: 'user-id', email: 'test@example.com' })
      .mockResolvedValueOnce(null);
    const known = await service.requestReset('test@example.com');
    const unknown = await service.requestReset('missing@example.com');
    expect(known).toEqual(unknown);
    expect(Object.keys(known)).toEqual(['message']);
    expect(delivery.send).toHaveBeenCalledTimes(1);
    expect(users.setPasswordResetToken).toHaveBeenCalledTimes(1);
  });

  it('sends a random token but stores only its hash with the configured 15-minute expiry', async () => {
    users.findByEmail.mockResolvedValue({
      id: 'user-id',
      email: 'test@example.com',
    });
    const started = Date.now();
    await service.requestReset('test@example.com');
    const token = delivery.send.mock.calls[0][1] as string;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const [id, tokenHash, expiresAt] = users.setPasswordResetToken.mock
      .calls[0] as [string, string, Date];
    expect(id).toBe('user-id');
    expect(tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(tokenHash).not.toBe(token);
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(
      started + 15 * 60 * 1000,
    );
    expect(expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 15 * 60 * 1000,
    );
    await service.requestReset('test@example.com');
    expect(delivery.send.mock.calls[1][1]).not.toBe(token);
  });

  it('uses the User module to persist a bcrypt password hash', async () => {
    users.resetPasswordWithToken.mockResolvedValue(true);
    await expect(
      service.resetPassword({
        token: 'a'.repeat(64),
        password: 'NewSecurePass1!',
      }),
    ).resolves.toEqual({ message: 'Password reset successfully.' });
    const [tokenHash, passwordHash] = users.resetPasswordWithToken.mock
      .calls[0] as [string, string];
    expect(tokenHash).toBe(
      createHash('sha256').update('a'.repeat(64)).digest('hex'),
    );
    expect(await compare('NewSecurePass1!', passwordHash)).toBe(true);
    expect(passwordHash).not.toBe('NewSecurePass1!');
  });

  it('rejects invalid tokens before hashing a password', async () => {
    users.hasValidPasswordResetToken.mockResolvedValue(false);
    await expect(
      service.resetPassword({
        token: 'a'.repeat(64),
        password: 'NewSecurePass1!',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(hash).not.toHaveBeenCalled();
    expect(users.resetPasswordWithToken).not.toHaveBeenCalled();
  });

  it('rejects a token that expires or is consumed after the initial check', async () => {
    users.resetPasswordWithToken.mockResolvedValue(false);
    await expect(
      service.resetPassword({
        token: 'a'.repeat(64),
        password: 'NewSecurePass1!',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

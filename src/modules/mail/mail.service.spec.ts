import { Test, TestingModule } from '@nestjs/testing';
import { MailerService } from '@nestjs-modules/mailer';
import { MailService } from './mail.service.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('MailService', () => {
  let service: MailService;

  const mockMailerService = {
    sendMail: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: MailerService,
          useValue: mockMailerService,
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  it('should send a password reset email with correct data', async () => {
    mockMailerService.sendMail.mockResolvedValue(undefined);

    await service.sendPasswordResetEmail(
      'janaa@example.com',
      'http://localhost:3000/reset-password?token=abc',
      20,
      'Jana Ahmed',
    );

    expect(mockMailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'janaa@example.com',
        subject: 'Reset Your Password – Daleel',
        template: 'password-reset',
        context: {
          name: 'Jana Ahmed',
          resetUrl: 'http://localhost:3000/reset-password?token=abc',
          expiryMinutes: 20,
        },
        text: expect.stringContaining('Hello Jana Ahmed'),
      }),
    );

    expect(mockMailerService.sendMail).toHaveBeenCalledTimes(1);
  });

  it('should use a default greeting when name is missing', async () => {
    mockMailerService.sendMail.mockResolvedValue(undefined);

    await service.sendPasswordResetEmail(
      'janaa@example.com',
      'http://localhost:3000/reset-password?token=abc',
      20,
    );

    expect(mockMailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          name: 'there',
        }),
        text: expect.stringContaining('Hello there,'),
      }),
    );
  });

  it('should propagate mail delivery errors', async () => {
    mockMailerService.sendMail.mockRejectedValue(
      new Error('SMTP connection failed'),
    );

    await expect(
      service.sendPasswordResetEmail(
        'janaa@example.com',
        'http://localhost:3000/reset-password?token=abc',
        20,
        'Jana Ahmed',
      ),
    ).rejects.toThrow('SMTP connection failed');
  });
});

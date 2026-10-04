import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { compare, hash } from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    createUser: ReturnType<typeof vi.fn>;
    findByEmail: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
  };
  let jwtService: {
    signAsync: ReturnType<typeof vi.fn>;
    verifyAsync: ReturnType<typeof vi.fn>;
  };

  const user = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'test@example.com',
    passwordHash: '',
    name: 'Test User',
    avatarUrl: null,
    bio: null,
    interests: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    mentorProfile: null,
  };

  beforeEach(async () => {
    usersService = {
      createUser: vi.fn(),
      findByEmail: vi.fn(),
      findById: vi.fn(),
    };
    jwtService = {
      signAsync: vi
        .fn()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token'),
      verifyAsync: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              switch (key) {
                case 'JWT_SECRET':
                  return 'a'.repeat(32);
                case 'JWT_REFRESH_SECRET':
                  return 'b'.repeat(32);
                case 'JWT_ACCESS_EXPIRES_IN':
                  return 900;
                case 'JWT_REFRESH_EXPIRES_IN':
                  return 604800;
                case 'BCRYPT_SALT_ROUNDS':
                  return 4;
                default:
                  throw new Error(`Unexpected config key: ${key}`);
              }
            },
          },
        },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  it('hashes a new password, creates the user, and issues tokens', async () => {
    usersService.createUser.mockImplementation(
      async (dto: { passwordHash: string }) => ({
        ...user,
        passwordHash: dto.passwordHash,
      }),
    );

    const session = await service.register({
      email: user.email,
      name: user.name,
      password: 'SecurePass1!',
    });

    const createDto = usersService.createUser.mock.calls[0]?.[0] as {
      passwordHash: string;
    };
    expect(await compare('SecurePass1!', createDto.passwordHash)).toBe(true);
    expect(session).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 900,
    });
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      { sub: user.id },
      { secret: 'a'.repeat(32), expiresIn: 900 },
    );
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      2,
      { sub: user.id },
      { secret: 'b'.repeat(32), expiresIn: 604800 },
    );
  });

  it('issues tokens when the password is valid', async () => {
    usersService.findByEmail.mockResolvedValue({
      ...user,
      passwordHash: await hash('SecurePass1!', 4),
    });

    const session = await service.login({
      email: user.email,
      password: 'SecurePass1!',
    });

    expect(session.accessToken).toBe('access-token');
  });

  it('returns the same unauthorized error for unknown email and bad password', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    await expect(
      service.login({ email: user.email, password: 'SecurePass1!' }),
    ).rejects.toThrow(UnauthorizedException);

    usersService.findByEmail.mockResolvedValue({
      ...user,
      passwordHash: await hash('DifferentPass1!', 4),
    });
    await expect(
      service.login({ email: user.email, password: 'SecurePass1!' }),
    ).rejects.toThrow('Invalid email or password');
  });

  it('rotates token pair for a valid refresh token', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: user.id });
    usersService.findById.mockResolvedValue(user);

    const session = await service.refresh('refresh-token');

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('refresh-token', {
      secret: 'b'.repeat(32),
    });
    expect(usersService.findById).toHaveBeenCalledWith(user.id);
    expect(session.refreshToken).toBe('refresh-token');
  });

  it('returns unauthorized when the refresh token user no longer exists', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: user.id });
    usersService.findById.mockRejectedValue(
      new NotFoundException('User not found'),
    );

    await expect(service.refresh('refresh-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

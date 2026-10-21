import { StorageService } from '../storage/storage.service.js';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };

  const storage = { uploadFile: vi.fn(), deleteFile: vi.fn() };
  const file = {
    buffer: Buffer.from('image'),
    mimetype: 'image/png',
  } as Express.Multer.File;

  const mockDate = new Date();
  const mockUser = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'test@example.com',
    passwordHash: 'hashedpassword123',
    name: 'Amr Khaled',
    avatarUrl: null,
    bio: null,
    interests: ['Web Development'],
    createdAt: mockDate,
    updatedAt: mockDate,
    mentorProfile: null,
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    prisma = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: StorageService, useValue: storage },
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUser', () => {
    it('should create a new user with normalized email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);

      const result = await service.createUser({
        email: '  TEST@example.com ',
        name: ' Amr Khaled ',
        passwordHash: 'hashedpassword123',
        interests: ['Web Development'],
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'test@example.com',
          name: 'Amr Khaled',
          passwordHash: 'hashedpassword123',
          avatarUrl: undefined,
          bio: undefined,
          interests: ['Web Development'],
        },
        include: {
          mentorProfile: true,
        },
      });
      expect(result).toEqual(mockUser);
    });

    it('should throw ConflictException if email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.createUser({
          email: 'test@example.com',
          name: 'Amr Khaled',
          passwordHash: 'hashedpassword123',
        }),
      ).rejects.toThrow(ConflictException);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return the user when found', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findById(mockUser.id);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        include: {
          mentorProfile: true,
        },
      });
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findById('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByEmail', () => {
    it('should find user by lowercased email', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findByEmail('  TEST@Example.com ');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        include: {
          mentorProfile: true,
        },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null if not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.findByEmail('unknown@example.com');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update user fields successfully', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      const updatedUser = {
        ...mockUser,
        name: 'Amr Updated',
        bio: 'Updated bio',
        interests: ['NestJS', 'React'],
      };
      prisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.update(mockUser.id, {
        name: ' Amr Updated ',
        bio: 'Updated bio',
        interests: ['NestJS', 'React'],
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          name: 'Amr Updated',
          bio: 'Updated bio',
          interests: ['NestJS', 'React'],
        },
        include: {
          mentorProfile: true,
        },
      });
      expect(result).toEqual(updatedUser);
    });

    it('should throw NotFoundException if user to update does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.update('non-existent-id', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  it('uploads a public avatar with a stable user identifier and preserves normal fields', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);
    storage.uploadFile.mockResolvedValue({
      url: 'https://example.com/avatar.png',
    });
    prisma.user.update.mockResolvedValue({
      ...mockUser,
      avatarUrl: 'https://example.com/avatar.png',
    });
    await service.update(
      mockUser.id,
      { bio: 'New bio', avatarUrl: 'https://example.com/ignored.png' },
      file,
    );
    expect(storage.uploadFile).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        folder: 'daleel/avatars',
        publicId: mockUser.id,
        type: 'upload',
        resourceType: 'image',
        overwrite: true,
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockUser.id },
        data: { bio: 'New bio', avatarUrl: 'https://example.com/avatar.png' },
      }),
    );
  });
  it('does not change the database if uploading fails, or upload for a missing user', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);
    storage.uploadFile.mockRejectedValue(new Error('Upload failed'));
    await expect(service.update(mockUser.id, {}, file)).rejects.toThrow(
      'Upload failed',
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
    storage.uploadFile.mockClear();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.update(mockUser.id, {}, file)).rejects.toThrow(
      NotFoundException,
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });
  it('does not delete a shared overwritten avatar when the database update fails', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);
    storage.uploadFile.mockResolvedValue({
      url: 'https://example.com/avatar.png',
    });
    prisma.user.update.mockRejectedValue(new Error('Database failed'));
    await expect(service.update(mockUser.id, {}, file)).rejects.toThrow(
      'Database failed',
    );
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it('stores the reset hash and expiration through the User module', async () => {
    const expiresAt = new Date();
    await service.setPasswordResetToken(mockUser.id, 'token-hash', expiresAt);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: mockUser.id },
      data: {
        passwordResetTokenHash: 'token-hash',
        passwordResetExpiresAt: expiresAt,
      },
    });
  });

  it('checks token expiry without loading password data', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: mockUser.id });
    expect(await service.hasValidPasswordResetToken('token-hash')).toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: {
        passwordResetTokenHash: 'token-hash',
        passwordResetExpiresAt: { gt: expect.any(Date) },
      },
      select: { id: true },
    });
    prisma.user.findUnique.mockResolvedValue(null);
    expect(await service.hasValidPasswordResetToken('invalid-token')).toBe(
      false,
    );
  });

  it('atomically consumes only an unexpired token and updates the password', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    expect(
      await service.resetPasswordWithToken('token-hash', 'new-password-hash'),
    ).toBe(true);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        passwordResetTokenHash: 'token-hash',
        passwordResetExpiresAt: { gt: expect.any(Date) },
      },
      data: {
        passwordHash: 'new-password-hash',
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    });
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    expect(
      await service.resetPasswordWithToken('used-token', 'new-password-hash'),
    ).toBe(false);
  });
});

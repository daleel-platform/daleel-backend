import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { ProfilePictureService } from './profile-picture.service.js';

describe('ProfilePictureService', () => {
  const user = {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  };
  const prisma = { user, $transaction: vi.fn() };
  const storage = { uploadFile: vi.fn(), deleteFile: vi.fn() };
  const service = new ProfilePictureService(
    prisma as unknown as PrismaService,
    storage as unknown as StorageService,
  );
  const file = {} as Express.Multer.File;
  beforeEach(() => {
    vi.resetAllMocks();
    user.findUnique.mockResolvedValue({
      avatarUrl: 'old-url',
      avatarPublicId: 'daleel/avatars/old',
    });
    user.updateMany.mockResolvedValue({ count: 1 });
    user.findUniqueOrThrow.mockResolvedValue({ avatarUrl: 'new-url' });
    prisma.$transaction.mockImplementation((callback) => callback({ user }));
    storage.uploadFile.mockResolvedValue({
      publicId: 'daleel/avatars/new',
      url: 'new-url',
    });
  });
  it('uploads for a user without any mentor dependency and returns only the photo URL', async () => {
    expect(await service.upload('owner', file)).toEqual({
      avatarUrl: 'new-url',
    });
    expect(user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'owner',
        avatarUrl: 'old-url',
        avatarPublicId: 'daleel/avatars/old',
      },
      data: { avatarUrl: 'new-url', avatarPublicId: 'daleel/avatars/new' },
    });
    expect(storage.deleteFile).toHaveBeenCalledExactlyOnceWith(
      'daleel/avatars/old',
      { type: 'upload', resourceType: 'image' },
    );
  });
  it('rejects missing users before uploading', async () => {
    user.findUnique.mockResolvedValue(null);
    await expect(service.upload('missing', file)).rejects.toMatchObject({
      status: 404,
    });
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });
  it('cleans up only the new file on concurrent changes', async () => {
    user.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.upload('owner', file)).rejects.toMatchObject({
      status: 409,
    });
    expect(storage.deleteFile).toHaveBeenCalledExactlyOnceWith(
      'daleel/avatars/new',
      { type: 'upload', resourceType: 'image' },
    );
  });
  it('cleans up the upload when related transaction work fails', async () => {
    const persist = vi
      .fn()
      .mockRejectedValue(new Error('Related insert failed'));
    await expect(service.replaceWith('owner', file, persist)).rejects.toThrow(
      'Related insert failed',
    );
    expect(persist).toHaveBeenCalledWith({ user });
    expect(storage.deleteFile).toHaveBeenCalledExactlyOnceWith(
      'daleel/avatars/new',
      { type: 'upload', resourceType: 'image' },
    );
  });
  it('does not change the database or delete the old photo when uploading fails', async () => {
    storage.uploadFile.mockRejectedValue(new Error('Upload failed'));
    await expect(service.upload('owner', file)).rejects.toThrow(
      'Upload failed',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
});

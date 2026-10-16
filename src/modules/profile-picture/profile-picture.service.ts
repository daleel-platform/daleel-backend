import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { ProfilePictureResponseDto } from './dto/profile-picture-response.dto.js';

@Injectable()
export class ProfilePictureService {
  private readonly logger = new Logger(ProfilePictureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(
    userId: string,
    file: Express.Multer.File,
  ): Promise<ProfilePictureResponseDto> {
    return this.replaceWith(userId, file, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { avatarUrl: true },
      });
      return { avatarUrl: user.avatarUrl! };
    });
  }

  /** Run related database changes in the same transaction as the photo update. */
  async replaceWith<T>(
    userId: string,
    file: Express.Multer.File,
    persist: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarPublicId: true, avatarUrl: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const asset = await this.storage.uploadFile(file, {
      folder: 'daleel/avatars',
      resourceType: 'image',
      type: 'upload',
      transformation: [{ width: 512, height: 512, crop: 'limit' }],
    });
    let result: T;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.updateMany({
          where: {
            id: userId,
            avatarPublicId: user.avatarPublicId,
            avatarUrl: user.avatarUrl,
          },
          data: { avatarUrl: asset.url, avatarPublicId: asset.publicId },
        });
        if (updated.count !== 1)
          throw new ConflictException(
            'Profile photo changed during upload; please retry',
          );
        return persist(tx);
      });
    } catch (error) {
      await this.cleanup(asset.publicId);
      throw error;
    }
    if (user.avatarPublicId) await this.cleanup(user.avatarPublicId);
    return result;
  }

  private async cleanup(publicId: string): Promise<void> {
    try {
      await this.storage.deleteFile(publicId, {
        resourceType: 'image',
        type: 'upload',
      });
    } catch {
      this.logger.warn(`Could not remove unused avatar asset: ${publicId}`);
    }
  }
}

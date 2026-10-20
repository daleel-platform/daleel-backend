import { StorageService } from '../storage/storage.service.js';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

export type UserWithMentorProfile = Prisma.UserGetPayload<{
  include: { mentorProfile: true };
}>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Creates a new user. Called by the Auth module during registration or by seed scripts.
   */
  async createUser(dto: CreateUserDto): Promise<UserWithMentorProfile> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    return this.prisma.user.create({
      data: {
        email: normalizedEmail,
        name: dto.name.trim(),
        passwordHash: dto.passwordHash,
        avatarUrl: dto.avatarUrl,
        bio: dto.bio,
        interests: dto.interests ?? [],
      },
      include: {
        mentorProfile: true,
      },
    });
  }

  /**
   * Retrieves a user by their unique ID, including their mentor profile if present.
   */
  async findById(id: string): Promise<UserWithMentorProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        mentorProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    return user;
  }

  /**
   * Retrieves a user by email, including their mentor profile.
   */
  async findByEmail(email: string): Promise<UserWithMentorProfile | null> {
    return this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: {
        mentorProfile: true,
      },
    });
  }

  /**
   * Updates profile fields for an existing user.
   */
  async update(
    id: string,
    dto: UpdateUserDto,
    file?: Express.Multer.File,
  ): Promise<UserWithMentorProfile> {
    // Ensures user exists before updating, throwing NotFoundException if not found
    await this.findById(id);

    const avatarUrl = file
      ? (
          await this.storage.uploadFile(file, {
            folder: 'daleel/avatars',
            publicId: id,
            type: 'upload',
            resourceType: 'image',
            overwrite: true,
            transformation: { width: 512, height: 512, crop: 'limit' },
          })
        ).url
      : dto.avatarUrl;
    // Cloudinary overwrite cannot be rolled back with PostgreSQL. Do not delete
    // the shared asset on DB failure; retrying replaces the same identifier.
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.interests !== undefined && { interests: dto.interests }),
      },
      include: {
        mentorProfile: true,
      },
    });
  }

  /** Replaces any previous reset token; only the hash is persisted. */
  async setPasswordResetToken(
    id: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: expiresAt,
      },
    });
  }

  /** Rejects invalid tokens before the Auth module performs expensive hashing. */
  async hasValidPasswordResetToken(tokenHash: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    return user !== null;
  }

  /** One atomic statement checks expiry, changes the password and consumes the token.
   * Concurrent submissions cannot both succeed.
   */
  async resetPasswordWithToken(
    tokenHash: string,
    passwordHash: string,
  ): Promise<boolean> {
    const result = await this.prisma.user.updateMany({
      where: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { gt: new Date() },
      },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    });
    return result.count === 1;
  }
}

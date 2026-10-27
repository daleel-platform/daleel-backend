import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { MentorsController } from './mentors.controller.js';
import { MentorsService } from './mentors.service.js';
import { MentorMatchingService } from './mentor-matching.service.js';
import { MentorEmbeddingService } from './mentor-embedding.service.js';
import { EmbeddingProvider } from './embedding.provider.js';

@Module({
  // In-memory cache; swap the store (e.g. @keyv/redis) to share it across instances.
  imports: [
    PrismaModule,
    UsersModule,
    JwtModule.register({}),
    CacheModule.register(),
  ],
  controllers: [MentorsController],
  providers: [
    MentorsService,
    MentorMatchingService,
    MentorEmbeddingService,
    EmbeddingProvider,
    JwtAuthGuard,
  ],
  exports: [MentorsService],
})
export class MentorsModule {}

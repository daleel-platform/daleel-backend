import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ProfilePictureController } from './profile-picture.controller.js';
import { ProfilePictureService } from './profile-picture.service.js';
import { ProfilePictureUploadModule } from './profile-picture-upload.module.js';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    JwtModule.register({}),
    ProfilePictureUploadModule,
  ],
  controllers: [ProfilePictureController],
  providers: [ProfilePictureService, JwtAuthGuard],
  exports: [ProfilePictureService, ProfilePictureUploadModule],
})
export class ProfilePictureModule {}

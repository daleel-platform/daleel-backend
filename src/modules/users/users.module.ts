import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { StorageModule } from '../storage/storage.module.js';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [
    JwtModule.register({}),
    PrismaModule,
    StorageModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          fileSize: config.get<number>('STORAGE_IMAGE_MAX_BYTES', 5242880),
          files: 1,
          fields: 20,
        },
        fileFilter: (_request, file, callback) => {
          if (
            !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
          )
            return callback(
              new BadRequestException(
                'Only JPEG, PNG and WebP images are accepted',
              ),
              false,
            );
          callback(null, true);
        },
      }),
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService, JwtAuthGuard],
  exports: [UsersService],
})
export class UsersModule {}

import { BadRequestException, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';

const uploadModule = MulterModule.registerAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    limits: {
      fileSize: config.get<number>('STORAGE_IMAGE_MAX_BYTES', 5242880),
      files: 1,
      fields: 20,
    },
    fileFilter: (_request, file, callback) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
        return callback(
          new BadRequestException(
            'Only JPEG, PNG and WebP images are accepted',
          ),
          false,
        );
      callback(null, true);
    },
  }),
});

@Module({ imports: [uploadModule], exports: [MulterModule] })
export class ProfilePictureUploadModule {}

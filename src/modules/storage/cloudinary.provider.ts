import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

export const CLOUDINARY_CLIENT = Symbol('CLOUDINARY_CLIENT');
export type CloudinaryClient = typeof cloudinary;
export const CloudinaryProvider = {
  provide: CLOUDINARY_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): CloudinaryClient | null => {
    const cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME');
    if (!cloudName) return null;
    cloudinary.config({
      cloud_name: cloudName,
      api_key: config.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: config.getOrThrow<string>('CLOUDINARY_API_SECRET'),
      secure: true,
    });
    return cloudinary;
  },
};

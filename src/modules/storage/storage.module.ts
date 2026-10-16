import { Module } from '@nestjs/common';
import { CloudinaryProvider } from './cloudinary.provider.js';
import { FileValidationService } from './file-validation.service.js';
import { StorageService } from './storage.service.js';

@Module({
  providers: [CloudinaryProvider, FileValidationService, StorageService],
  exports: [StorageService],
})
export class StorageModule {}

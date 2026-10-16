import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fileTypeFromBuffer } from 'file-type';

@Injectable()
export class FileValidationService {
  constructor(private readonly config: ConfigService) {}

  async validate(file: Express.Multer.File | Buffer): Promise<{
    buffer: Buffer;
    mime: string;
    format: string;
    resourceType: 'image' | 'raw';
  }> {
    const buffer = Buffer.isBuffer(file) ? file : file?.buffer;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0)
      throw new BadRequestException('A nonempty file is required');
    const imageLimit = this.config.get<number>(
      'STORAGE_IMAGE_MAX_BYTES',
      5 * 1024 * 1024,
    );
    const documentLimit = this.config.get<number>(
      'STORAGE_DOCUMENT_MAX_BYTES',
      15 * 1024 * 1024,
    );
    if (buffer.length > Math.max(imageLimit, documentLimit))
      throw new BadRequestException('File exceeds the size limit');
    let detected;
    try {
      detected = await fileTypeFromBuffer(buffer);
    } catch {
      throw new BadRequestException('Invalid file content');
    }
    if (
      !detected ||
      !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(
        detected.mime,
      )
    ) {
      throw new BadRequestException(
        'Only JPEG, PNG, WebP and PDF files are supported',
      );
    }
    if (!Buffer.isBuffer(file) && file.mimetype !== detected.mime)
      throw new BadRequestException(
        'File content does not match its declared MIME type',
      );
    const isImage = detected.mime.startsWith('image/');
    if (buffer.length > (isImage ? imageLimit : documentLimit))
      throw new BadRequestException('File exceeds the size limit');
    return {
      buffer,
      mime: detected.mime,
      format: detected.ext,
      resourceType: isImage ? 'image' : 'raw',
    };
  }
}

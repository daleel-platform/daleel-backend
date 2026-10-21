import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CLOUDINARY_CLIENT,
  type CloudinaryClient,
} from './cloudinary.provider.js';
import { FileValidationService } from './file-validation.service.js';
import type {
  DeleteOptions,
  SignedUrlOptions,
  UploadOptions,
  UploadResult,
} from './storage.types.js';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  constructor(
    @Inject(CLOUDINARY_CLIENT) private readonly client: CloudinaryClient | null,
    private readonly files: FileValidationService,
  ) {}

  async uploadFile(
    file: Express.Multer.File | Buffer,
    options: UploadOptions,
  ): Promise<UploadResult> {
    this.validatePath(options.folder);
    if (
      options.publicId !== undefined &&
      !/^[a-zA-Z0-9_-]+$/.test(options.publicId)
    )
      throw new BadRequestException('Invalid asset identifier');
    if (options.overwrite && !options.publicId)
      throw new BadRequestException(
        'Overwrite requires an explicit asset identifier',
      );
    const validated = await this.files.validate(file);
    if (options.resourceType && options.resourceType !== validated.resourceType)
      throw new BadRequestException(
        'File type is not supported for this upload',
      );
    const client = this.getClient();
    const type = options.type ?? 'authenticated';
    // Raw public IDs retain the extension; callers store the returned identifier.
    const publicId =
      (options.publicId ?? randomUUID()) +
      (validated.resourceType === 'raw' ? '.' + validated.format : '');
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (error?: unknown) => {
        if (settled) return;
        settled = true;
        this.logUploadFailure(error);
        reject(new InternalServerErrorException('Media upload failed'));
      };
      try {
        const stream = client.uploader.upload_stream(
          {
            folder: options.folder,
            public_id: publicId,
            resource_type: validated.resourceType,
            type,
            overwrite: options.overwrite ?? false,
            invalidate: options.overwrite ?? false,
            transformation: options.transformation,
          },
          (error, result) => {
            if (error || !result) {
              fail(error);
              return;
            }
            if (settled) return;
            settled = true;
            resolve({
              publicId: result.public_id,
              url: result.secure_url,
              resourceType: validated.resourceType,
              type,
              format: result.format || validated.format,
              bytes: result.bytes,
            });
          },
        );
        stream.on('error', fail);
        stream.end(validated.buffer);
      } catch (error) {
        fail(error);
      }
    });
  }

  private logUploadFailure(error: unknown): void {
    // Never log raw SDK errors: they can contain credentials or signed URLs.
    const details = error && typeof error === 'object' ? error : {};
    const status = 'http_code' in details ? details.http_code : undefined;
    const httpStatus =
      typeof status === 'number' &&
      Number.isInteger(status) &&
      status >= 400 &&
      status <= 599
        ? status
        : undefined;
    const code = 'code' in details ? details.code : undefined;
    const networkCode =
      typeof code === 'string' &&
      [
        'ETIMEDOUT',
        'ECONNRESET',
        'ECONNREFUSED',
        'ENOTFOUND',
        'EAI_AGAIN',
      ].includes(code)
        ? code
        : undefined;
    this.logger.error({
      message: 'Cloudinary upload failed',
      httpStatus,
      networkCode,
      ...(httpStatus === 403
        ? { hint: 'Check API key asset creation permissions' }
        : {}),
    });
  }

  /** The calling feature must authorize access before requesting a private link. */
  getSignedUrl(publicId: string, options: SignedUrlOptions): string {
    this.validatePath(publicId);
    const expiresIn = options.expiresIn ?? 900;
    if (
      !Number.isInteger(expiresIn) ||
      expiresIn < 1 ||
      expiresIn > 86400 ||
      !/^[a-z0-9]+$/i.test(options.format)
    )
      throw new BadRequestException('Invalid signed URL options');
    if (options.type === 'upload')
      throw new BadRequestException(
        'Expiring links require authenticated assets',
      );
    const client = this.getClient();
    try {
      return client.utils.private_download_url(publicId, options.format, {
        resource_type: options.resourceType ?? 'image',
        type: 'authenticated',
        expires_at: Math.floor(Date.now() / 1000) + expiresIn,
        attachment: false,
      });
    } catch {
      throw new InternalServerErrorException('Media URL generation failed');
    }
  }

  async deleteFile(publicId: string, options: DeleteOptions): Promise<void> {
    this.validatePath(publicId);
    if (!options || !['upload', 'authenticated'].includes(options.type))
      throw new BadRequestException('Asset delivery type is required');
    const client = this.getClient();
    try {
      const result: unknown = await client.uploader.destroy(publicId, {
        resource_type: options.resourceType ?? 'image',
        type: options.type,
        invalidate: true,
      });
      if (
        !result ||
        typeof result !== 'object' ||
        !('result' in result) ||
        !['ok', 'not found'].includes(String(result.result))
      )
        throw new Error('Unexpected deletion result');
    } catch {
      throw new InternalServerErrorException('Media deletion failed');
    }
  }

  private getClient(): CloudinaryClient {
    if (!this.client)
      throw new ServiceUnavailableException('Cloud storage is not configured');
    return this.client;
  }
  private validatePath(path: string): void {
    if (
      !/^daleel\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(path) ||
      path.split('/').some((part) => part === '.' || part === '..')
    )
      throw new BadRequestException('Invalid storage path');
  }
}

import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudinaryClient } from './cloudinary.provider.js';
import { FileValidationService } from './file-validation.service.js';
import { StorageService } from './storage.service.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF1sAAAAASUVORK5CYII=',
  'base64',
);
describe('StorageService', () => {
  const upload = vi.fn();
  const destroy = vi.fn();
  const signed = vi.fn();
  const files = new FileValidationService(
    new ConfigService({
      STORAGE_IMAGE_MAX_BYTES: 1024,
      STORAGE_DOCUMENT_MAX_BYTES: 2048,
    }),
  );
  const client = {
    uploader: { upload_stream: upload, destroy },
    utils: { private_download_url: signed },
  } as unknown as CloudinaryClient;
  const service = new StorageService(client, files);
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());
  it('logs safe status and network diagnostics without raw provider data', async () => {
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const secretDetail = 'secret https://example.com?signature=private';
    upload.mockImplementation((_options, callback) => {
      queueMicrotask(() =>
        callback({
          http_code: 403,
          message: secretDetail,
          api_secret: secretDetail,
        }),
      );
      return new PassThrough();
    });
    await expect(
      service.uploadFile(png, { folder: 'daleel/avatars' }),
    ).rejects.toThrow('Media upload failed');
    expect(log).toHaveBeenCalledExactlyOnceWith({
      message: 'Cloudinary upload failed',
      httpStatus: 403,
      networkCode: undefined,
      hint: 'Check API key asset creation permissions',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(secretDetail);
    log.mockClear();
    upload.mockImplementation(() => {
      throw Object.assign(new Error(secretDetail), { code: 'ETIMEDOUT' });
    });
    await expect(
      service.uploadFile(png, { folder: 'daleel/avatars' }),
    ).rejects.toThrow('Media upload failed');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ networkCode: 'ETIMEDOUT' }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(secretDetail);
  });

  it('streams validated bytes and maps upload results', async () => {
    let received = Buffer.alloc(0);
    upload.mockImplementation((_options, callback) => {
      const stream = new PassThrough();
      stream.on('data', (chunk: Buffer) => {
        received = Buffer.concat([received, chunk]);
      });
      stream.on('finish', () =>
        callback(null, {
          public_id: 'daleel/avatars/id',
          secure_url: 'https://example.com/image.png',
          bytes: png.length,
          format: 'png',
        }),
      );
      return stream;
    });
    const result = await service.uploadFile(png, {
      folder: 'daleel/avatars',
      resourceType: 'image',
      type: 'upload',
    });
    expect(received).toEqual(png);
    expect(result).toMatchObject({
      publicId: 'daleel/avatars/id',
      type: 'upload',
      resourceType: 'image',
    });
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        overwrite: false,
        type: 'upload',
        resource_type: 'image',
      }),
      expect.any(Function),
    );
  });
  it('rejects unsupported, oversized, spoofed files and unsafe paths before uploading', async () => {
    for (const file of [
      Buffer.alloc(0),
      Buffer.from('<svg/>'),
      Buffer.alloc(3000),
      Buffer.concat([png, Buffer.alloc(1100)]),
    ]) {
      await expect(
        service.uploadFile(file, { folder: 'daleel/avatars' }),
      ).rejects.toMatchObject({ status: 400 });
    }
    await expect(
      files.validate({
        buffer: png,
        mimetype: 'image/jpeg',
      } as Express.Multer.File),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.uploadFile(png, { folder: 'daleel/../avatars' }),
    ).rejects.toMatchObject({ status: 400 });
    const pdf = Buffer.from('%PDF-1.4\n%document');
    expect(await files.validate(pdf)).toMatchObject({
      resourceType: 'raw',
      mime: 'application/pdf',
    });
    await expect(
      service.uploadFile(pdf, {
        folder: 'daleel/avatars',
        resourceType: 'image',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(upload).not.toHaveBeenCalled();
  });
  it('maps callback and stream failures to generic errors', async () => {
    upload.mockImplementation((_options, callback) => {
      callback({ message: 'provider detail' });
      return new PassThrough();
    });
    await expect(
      service.uploadFile(png, { folder: 'daleel/avatars' }),
    ).rejects.toThrow('Media upload failed');
    upload.mockImplementation(() => {
      const stream = new PassThrough();
      queueMicrotask(() => stream.emit('error', new Error('provider detail')));
      return stream;
    });
    await expect(
      service.uploadFile(png, { folder: 'daleel/avatars' }),
    ).rejects.toThrow('Media upload failed');
  });
  it('generates expiring authenticated URLs and rejects invalid options', () => {
    signed.mockReturnValue('https://example.com/signed');
    const start = Math.floor(Date.now() / 1000);
    expect(
      service.getSignedUrl('daleel/chats/id', {
        format: 'pdf',
        resourceType: 'raw',
        expiresIn: 60,
      }),
    ).toBe('https://example.com/signed');
    expect(signed).toHaveBeenCalledWith(
      'daleel/chats/id',
      'pdf',
      expect.objectContaining({ type: 'authenticated', resource_type: 'raw' }),
    );
    expect(signed.mock.calls[0][2].expires_at).toBeGreaterThanOrEqual(
      start + 60,
    );
    expect(() =>
      service.getSignedUrl('daleel/chats/id', { format: 'png', expiresIn: 0 }),
    ).toThrow();
    expect(() =>
      service.getSignedUrl('daleel/chats/id', {
        format: 'png',
        type: 'upload',
      }),
    ).toThrow();
  });
  it('deletes the correct delivery type and handles missing assets and errors', async () => {
    for (const result of ['ok', 'not found']) {
      destroy.mockResolvedValue({ result });
      await expect(
        service.deleteFile('daleel/avatars/id', { type: 'upload' }),
      ).resolves.toBeUndefined();
    }
    expect(destroy).toHaveBeenCalledWith(
      'daleel/avatars/id',
      expect.objectContaining({ type: 'upload', invalidate: true }),
    );
    destroy.mockRejectedValue(new Error('provider detail'));
    await expect(service.deleteFile('daleel/avatars/id')).rejects.toThrow(
      'Media deletion failed',
    );
  });
  it('returns 503 without configuration', async () => {
    await expect(
      new StorageService(null, files).uploadFile(png, {
        folder: 'daleel/avatars',
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
});

import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test, TestingModule } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { PassThrough } from 'node:stream';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor.js';
import {
  DELETED_MESSAGE_PLACEHOLDER,
  SIGNED_MEDIA_URL_TTL_SECONDS,
} from '../src/modules/messaging/messaging.constants.js';
import { CLOUDINARY_CLIENT } from '../src/modules/storage/cloudinary.provider.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF1sAAAAASUVORK5CYII=',
  'base64',
);
const VALID_PDF = Buffer.from('%PDF-1.4\n%daleel-test-pdf\n%%EOF\n');

describe('Messaging Media Attachments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let baseUrl: string;

  let user1Id: string;
  let user2Id: string;
  let user3Id: string;

  let user1Token: string;
  let user2Token: string;
  let user3Token: string;

  let conversationId: string;
  let otherConversationId: string;
  let otherConversationMsgId: string;

  const mockUploadStream = vi.fn();
  const mockDestroy = vi.fn();
  const mockPrivateDownloadUrl = vi.fn();

  const mockCloudinaryClient = {
    uploader: {
      upload_stream: mockUploadStream,
      destroy: mockDestroy,
    },
    utils: {
      private_download_url: mockPrivateDownloadUrl,
    },
  };

  const configureCloudinaryMock = (): void => {
    mockUploadStream.mockImplementation(
      (
        options: {
          folder: string;
          public_id: string;
          resource_type: string;
          type: string;
        },
        callback: (error: unknown, result?: unknown) => void,
      ) => {
        const chunks: Buffer[] = [];
        const stream = new PassThrough();
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('finish', () => {
          const uploaded = Buffer.concat(chunks);
          const publicId = `${options.folder}/${options.public_id}`;
          callback(null, {
            public_id: publicId,
            secure_url: `https://res.cloudinary.test/${options.resource_type}/${options.type}/${publicId}`,
            bytes: uploaded.length,
            format: options.resource_type === 'raw' ? 'pdf' : undefined,
          });
        });
        return stream;
      },
    );

    mockPrivateDownloadUrl.mockImplementation(
      (
        publicId: string,
        format: string,
        options: { resource_type: string; type: string; expires_at: number },
      ) =>
        `https://signed.cloudinary.test/${options.resource_type}/${options.type}/${publicId}.${format}?expires_at=${options.expires_at}`,
    );

    mockDestroy.mockResolvedValue({ result: 'ok' });
  };

  beforeAll(async () => {
    configureCloudinaryMock();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CLOUDINARY_CLIENT)
      .useValue(mockCloudinaryClient)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());

    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://localhost:${address.port}`;

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);
    const jwtSecret = configService.getOrThrow<string>('JWT_SECRET');

    await prisma.user.deleteMany({
      where: { email: { contains: 'messaging-media-e2e' } },
    });

    const [u1, u2, u3] = await Promise.all([
      prisma.user.create({
        data: {
          email: 'messaging-media-e2e-u1@example.com',
          name: 'Media User One',
          passwordHash: 'hash1',
        },
      }),
      prisma.user.create({
        data: {
          email: 'messaging-media-e2e-u2@example.com',
          name: 'Media User Two',
          passwordHash: 'hash2',
        },
      }),
      prisma.user.create({
        data: {
          email: 'messaging-media-e2e-u3@example.com',
          name: 'Media Outsider Three',
          passwordHash: 'hash3',
        },
      }),
    ]);

    user1Id = u1.id;
    user2Id = u2.id;
    user3Id = u3.id;

    [user1Token, user2Token, user3Token] = await Promise.all([
      jwtService.signAsync(
        { sub: user1Id },
        { secret: jwtSecret, expiresIn: 900 },
      ),
      jwtService.signAsync(
        { sub: user2Id },
        { secret: jwtSecret, expiresIn: 900 },
      ),
      jwtService.signAsync(
        { sub: user3Id },
        { secret: jwtSecret, expiresIn: 900 },
      ),
    ]);

    const [p1, p2] =
      user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];
    const conv = await prisma.conversation.create({
      data: { participant1Id: p1, participant2Id: p2 },
    });
    conversationId = conv.id;

    const [op1, op2] =
      user1Id < user3Id ? [user1Id, user3Id] : [user3Id, user1Id];
    const otherConv = await prisma.conversation.create({
      data: {
        participant1Id: op1,
        participant2Id: op2,
        messages: {
          create: {
            senderId: user1Id,
            content: 'Message in another conversation',
          },
        },
      },
      include: { messages: true },
    });
    otherConversationId = otherConv.id;
    otherConversationMsgId = otherConv.messages[0].id;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    configureCloudinaryMock();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({
        where: { email: { contains: 'messaging-media-e2e' } },
      });
    }
    if (app) {
      await app.close();
    }
  });

  describe('Authorization & Validation', () => {
    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/conversations/${conversationId}/attachment-messages`)
        .attach('file', VALID_PNG, 'photo.png')
        .expect(401);

      expect(mockUploadStream).not.toHaveBeenCalled();
    });

    it('rejects invalid conversation UUID with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/conversations/not-a-uuid/attachment-messages')
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', VALID_PNG, 'photo.png')
        .expect(400);
    });

    it('forbids non-participant users from uploading or refreshing signed URLs', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/conversations/${conversationId}/attachment-messages`)
        .set('Authorization', `Bearer ${user3Token}`)
        .attach('file', VALID_PNG, 'photo.png')
        .expect(403);

      await request(app.getHttpServer())
        .get(
          `/api/v1/conversations/${conversationId}/messages/00000000-0000-0000-0000-000000000000/media-url`,
        )
        .set('Authorization', `Bearer ${user3Token}`)
        .expect(403);

      expect(mockUploadStream).not.toHaveBeenCalled();
    });

    it('returns 404 for nonexistent conversation', async () => {
      await request(app.getHttpServer())
        .post(
          '/api/v1/conversations/00000000-0000-0000-0000-000000000000/attachment-messages',
        )
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', VALID_PNG, 'photo.png')
        .expect(404);
    });

    it('rejects missing file, unsupported MIME, spoofed MIME, invalid bytes, oversized file, and cross-chat replyToId', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/conversations/${conversationId}/attachment-messages`)
        .set('Authorization', `Bearer ${user1Token}`)
        .field('content', 'No file attached')
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/v1/conversations/${conversationId}/attachment-messages`)
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', Buffer.from('<svg/>'), {
          filename: 'vector.svg',
          contentType: 'image/svg+xml',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/v1/conversations/${conversationId}/attachment-messages`)
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', VALID_PNG, {
          filename: 'spoofed.jpg',
          contentType: 'image/jpeg',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/v1/conversations/${conversationId}/attachment-messages`)
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', Buffer.from('plain text masquerading as png'), {
          filename: 'fake.png',
          contentType: 'image/png',
        })
        .expect(400);

      const imageMaxBytes = configService.get<number>(
        'STORAGE_IMAGE_MAX_BYTES',
        5242880,
      );
      const docMaxBytes = configService.get<number>(
        'STORAGE_DOCUMENT_MAX_BYTES',
        15728640,
      );

      if (imageMaxBytes < docMaxBytes) {
        await request(app.getHttpServer())
          .post(`/api/v1/conversations/${conversationId}/attachment-messages`)
          .set('Authorization', `Bearer ${user1Token}`)
          .attach(
            'file',
            Buffer.concat([VALID_PNG, Buffer.alloc(imageMaxBytes)]),
            { filename: 'too-big-image.png', contentType: 'image/png' },
          )
          .expect(400);
      }

      await request(app.getHttpServer())
        .post(`/api/v1/conversations/${conversationId}/attachment-messages`)
        .set('Authorization', `Bearer ${user1Token}`)
        .attach(
          'file',
          Buffer.alloc(Math.max(imageMaxBytes, docMaxBytes) + 1),
          { filename: 'too-big.pdf', contentType: 'application/pdf' },
        )
        .expect(413);

      await request(app.getHttpServer())
        .post(`/api/v1/conversations/${conversationId}/attachment-messages`)
        .set('Authorization', `Bearer ${user1Token}`)
        .field('replyToId', otherConversationMsgId)
        .attach('file', VALID_PNG, 'photo.png')
        .expect(404);

      expect(mockUploadStream).not.toHaveBeenCalled();
    });
  });

  describe('Full Media Lifecycle: Upload -> WS Broadcast -> History -> Refresh -> Edit -> Delete', () => {
    it('supports image and PDF uploads, WebSocket broadcast, reply metadata, URL refresh, caption edit, and media cleanup on delete', async () => {
      const client1: Socket = io(baseUrl, {
        auth: { token: user1Token },
        transports: ['websocket'],
        reconnection: false,
      });
      const client2: Socket = io(baseUrl, {
        auth: { token: user2Token },
        transports: ['websocket'],
        reconnection: false,
      });

      await Promise.all([
        new Promise<void>((resolve) => client1.on('connect', resolve)),
        new Promise<void>((resolve) => client2.on('connect', resolve)),
      ]);

      await Promise.all([
        new Promise<void>((resolve) =>
          client1.emit('joinConversation', { conversationId }, () => resolve()),
        ),
        new Promise<void>((resolve) =>
          client2.emit('joinConversation', { conversationId }, () => resolve()),
        ),
      ]);

      try {
        // 1. User1 uploads PNG with caption -> User2 receives 'messageCreated'
        const imageBroadcastPromise = new Promise<{
          id: string;
          type: string;
          content: string;
          mediaUrl: string | null;
          fileName: string | null;
          fileSize: number | null;
          mimeType: string | null;
          mediaPublicId?: string;
        }>((resolve) => {
          client2.once('messageCreated', (msg) => resolve(msg));
        });

        const imageUploadRes = await request(app.getHttpServer())
          .post(`/api/v1/conversations/${conversationId}/attachment-messages`)
          .set('Authorization', `Bearer ${user1Token}`)
          .field('content', '  Architecture diagram  ')
          .attach('file', VALID_PNG, {
            filename: '../../nested\\architecture.png',
            contentType: 'image/png',
          })
          .expect(201);

        const imageBroadcast = await imageBroadcastPromise;
        const imageMsg = imageUploadRes.body.data;

        expect(imageUploadRes.body.success).toBe(true);
        expect(imageMsg.type).toBe('IMAGE');
        expect(imageMsg.content).toBe('Architecture diagram');
        expect(imageMsg.fileName).toBe('architecture.png');
        expect(imageMsg.fileSize).toBe(VALID_PNG.length);
        expect(imageMsg.mimeType).toBe('image/png');
        expect(imageMsg.mediaUrl).toContain(
          `https://signed.cloudinary.test/image/authenticated/daleel/conversations/${conversationId}/`,
        );
        expect(imageMsg.mediaPublicId).toBeUndefined();

        expect(mockUploadStream).toHaveBeenCalledWith(
          expect.objectContaining({
            folder: `daleel/conversations/${conversationId}`,
            resource_type: 'image',
            type: 'authenticated',
          }),
          expect.any(Function),
        );

        expect(imageBroadcast.id).toBe(imageMsg.id);
        expect(imageBroadcast.type).toBe('IMAGE');
        expect(imageBroadcast.mediaUrl).toBe(imageMsg.mediaUrl);
        expect(imageBroadcast.fileName).toBe('architecture.png');
        expect(imageBroadcast.mediaPublicId).toBeUndefined();

        const storedImageRecord = await prisma.message.findUniqueOrThrow({
          where: { id: imageMsg.id },
          select: { mediaPublicId: true },
        });
        expect(storedImageRecord.mediaPublicId).toMatch(
          new RegExp(`^daleel/conversations/${conversationId}/`),
        );

        // 2. User2 uploads PDF without caption replying to imageMsg
        const pdfUploadRes = await request(app.getHttpServer())
          .post(`/api/v1/conversations/${conversationId}/attachment-messages`)
          .set('Authorization', `Bearer ${user2Token}`)
          .field('replyToId', imageMsg.id)
          .attach('file', VALID_PDF, {
            filename: 'mentorship-plan.pdf',
            contentType: 'application/pdf',
          })
          .expect(201);

        const pdfMsg = pdfUploadRes.body.data;
        expect(pdfMsg.type).toBe('DOCUMENT');
        expect(pdfMsg.content).toBe('');
        expect(pdfMsg.fileName).toBe('mentorship-plan.pdf');
        expect(pdfMsg.fileSize).toBe(VALID_PDF.length);
        expect(pdfMsg.mimeType).toBe('application/pdf');
        expect(pdfMsg.mediaUrl).toContain(
          `https://signed.cloudinary.test/raw/authenticated/daleel/conversations/${conversationId}/`,
        );
        expect(pdfMsg.mediaPublicId).toBeUndefined();
        expect(pdfMsg.replyTo).toEqual({
          id: imageMsg.id,
          senderId: user1Id,
          type: 'IMAGE',
          content: 'Architecture diagram',
          fileName: 'architecture.png',
        });

        // Verify GET /conversations signs lastMessage mediaUrl when latest message is media
        const mediaConvListRes = await request(app.getHttpServer())
          .get('/api/v1/conversations')
          .set('Authorization', `Bearer ${user1Token}`)
          .expect(200);
        const convWithMedia = mediaConvListRes.body.data.find(
          (c: { id: string }) => c.id === conversationId,
        );
        expect(convWithMedia).toBeDefined();
        expect(convWithMedia.lastMessage.id).toBe(pdfMsg.id);
        expect(convWithMedia.lastMessage.mediaUrl).toContain(
          'https://signed.cloudinary.test/raw/authenticated/',
        );
        expect(convWithMedia.lastMessage.mediaPublicId).toBeUndefined();

        // 3. User1 sends a plain TEXT message over WebSocket
        const textMsgAck = await new Promise<{
          success: boolean;
          data: { id: string; type: string; mediaUrl: string | null };
        }>((resolve) => {
          client1.emit(
            'sendMessage',
            { conversationId, content: 'Let me know what you think!' },
            (ack: {
              success: boolean;
              data: { id: string; type: string; mediaUrl: string | null };
            }) => resolve(ack),
          );
        });
        expect(textMsgAck.success).toBe(true);
        expect(textMsgAck.data.type).toBe('TEXT');
        expect(textMsgAck.data.mediaUrl).toBeNull();
        const textMsgId = textMsgAck.data.id;

        // 4. GET /messages and GET /conversations return signed URLs without leaking mediaPublicId
        const historyRes = await request(app.getHttpServer())
          .get(`/api/v1/conversations/${conversationId}/messages`)
          .set('Authorization', `Bearer ${user2Token}`)
          .expect(200);

        const historyItems = historyRes.body.data.items;
        expect(historyItems).toHaveLength(3);
        expect(historyItems[0].mediaUrl).toContain(
          'https://signed.cloudinary.test/image/authenticated/',
        );
        expect(historyItems[1].mediaUrl).toContain(
          'https://signed.cloudinary.test/raw/authenticated/',
        );
        expect(historyItems[2].mediaUrl).toBeNull();
        for (const item of historyItems) {
          expect(item.mediaPublicId).toBeUndefined();
        }

        const convListRes = await request(app.getHttpServer())
          .get('/api/v1/conversations')
          .set('Authorization', `Bearer ${user1Token}`)
          .expect(200);
        const targetConv = convListRes.body.data.find(
          (c: { id: string }) => c.id === conversationId,
        );
        expect(targetConv).toBeDefined();
        expect(targetConv.lastMessage.id).toBe(textMsgId);
        expect(targetConv.lastMessage.mediaPublicId).toBeUndefined();

        // 5. Refresh signed URL endpoint checks
        const refreshRes = await request(app.getHttpServer())
          .get(
            `/api/v1/conversations/${conversationId}/messages/${pdfMsg.id}/media-url`,
          )
          .set('Authorization', `Bearer ${user1Token}`)
          .expect(200);

        expect(refreshRes.body.data).toEqual({
          mediaUrl: expect.stringContaining(
            'https://signed.cloudinary.test/raw/authenticated/',
          ),
          expiresIn: SIGNED_MEDIA_URL_TTL_SECONDS,
        });

        await request(app.getHttpServer())
          .get(
            `/api/v1/conversations/${conversationId}/messages/${textMsgId}/media-url`,
          )
          .set('Authorization', `Bearer ${user1Token}`)
          .expect(404);

        await request(app.getHttpServer())
          .get(
            `/api/v1/conversations/${otherConversationId}/messages/${pdfMsg.id}/media-url`,
          )
          .set('Authorization', `Bearer ${user1Token}`)
          .expect(404);

        // 6. Edit caption on media message via WS
        const [editAck, editBroadcast] = await Promise.all([
          new Promise<{
            success: boolean;
            data: {
              id: string;
              type: string;
              content: string;
              isEdited: boolean;
              mediaUrl: string | null;
              fileName: string | null;
            };
          }>((resolve) => {
            client1.emit(
              'editMessage',
              {
                messageId: imageMsg.id,
                content: 'Updated architecture diagram',
              },
              (ack: {
                success: boolean;
                data: {
                  id: string;
                  type: string;
                  content: string;
                  isEdited: boolean;
                  mediaUrl: string | null;
                  fileName: string | null;
                };
              }) => resolve(ack),
            );
          }),
          new Promise<{
            id: string;
            content: string;
            isEdited: boolean;
            mediaUrl: string | null;
          }>((resolve) => {
            client2.once('messageUpdated', (msg) => resolve(msg));
          }),
        ]);

        expect(editAck.success).toBe(true);
        expect(editAck.data.type).toBe('IMAGE');
        expect(editAck.data.content).toBe('Updated architecture diagram');
        expect(editAck.data.isEdited).toBe(true);
        expect(editAck.data.fileName).toBe('architecture.png');
        expect(editAck.data.mediaUrl).toContain(
          'https://signed.cloudinary.test/image/authenticated/',
        );
        expect(editBroadcast.content).toBe('Updated architecture diagram');

        // 7. Delete media message via WS -> triggers Cloudinary destroy & masks history + replyTo
        const deleteAck = await new Promise<{
          success: boolean;
          data: {
            id: string;
            content: string;
            isDeleted: boolean;
            mediaUrl: string | null;
            fileName: string | null;
            fileSize: number | null;
            mimeType: string | null;
          };
        }>((resolve) => {
          client1.emit(
            'deleteMessage',
            { messageId: imageMsg.id },
            (ack: {
              success: boolean;
              data: {
                id: string;
                content: string;
                isDeleted: boolean;
                mediaUrl: string | null;
                fileName: string | null;
                fileSize: number | null;
                mimeType: string | null;
              };
            }) => resolve(ack),
          );
        });

        expect(deleteAck.success).toBe(true);
        expect(deleteAck.data.isDeleted).toBe(true);
        expect(deleteAck.data.content).toBe(DELETED_MESSAGE_PLACEHOLDER);
        expect(deleteAck.data.mediaUrl).toBeNull();
        expect(deleteAck.data.fileName).toBeNull();
        expect(deleteAck.data.fileSize).toBeNull();
        expect(deleteAck.data.mimeType).toBeNull();
        expect(mockDestroy).toHaveBeenCalledWith(
          storedImageRecord.mediaPublicId,
          expect.objectContaining({
            resource_type: 'image',
            type: 'authenticated',
            invalidate: true,
          }),
        );

        // Refresh endpoint should now reject deleted media message
        await request(app.getHttpServer())
          .get(
            `/api/v1/conversations/${conversationId}/messages/${imageMsg.id}/media-url`,
          )
          .set('Authorization', `Bearer ${user2Token}`)
          .expect(404);

        // History should mask deleted parent's media fields and reply preview fileName
        const afterDeleteHistory = await request(app.getHttpServer())
          .get(`/api/v1/conversations/${conversationId}/messages`)
          .set('Authorization', `Bearer ${user2Token}`)
          .expect(200);

        const [deletedImgItem, replyPdfItem] =
          afterDeleteHistory.body.data.items;
        expect(deletedImgItem.isDeleted).toBe(true);
        expect(deletedImgItem.mediaUrl).toBeNull();
        expect(deletedImgItem.fileName).toBeNull();
        expect(replyPdfItem.replyTo).toEqual({
          id: imageMsg.id,
          senderId: user1Id,
          type: 'IMAGE',
          content: DELETED_MESSAGE_PLACEHOLDER,
          fileName: null,
        });
      } finally {
        client1.disconnect();
        client2.disconnect();
      }
    });
  });

  describe('Swagger OpenAPI Documentation', () => {
    it('documents attachment upload and signed media refresh routes with bearer auth', () => {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().addBearerAuth().build(),
      );

      const uploadOp =
        document.paths['/api/v1/conversations/{id}/attachment-messages']?.post;
      expect(uploadOp).toBeDefined();
      expect(uploadOp?.security).toEqual([{ bearer: [] }]);
      expect(uploadOp?.requestBody).toHaveProperty(
        'content.multipart/form-data',
      );

      const refreshOp =
        document.paths[
          '/api/v1/conversations/{id}/messages/{messageId}/media-url'
        ]?.get;
      expect(refreshOp).toBeDefined();
      expect(refreshOp?.security).toEqual([{ bearer: [] }]);
    });
  });
});

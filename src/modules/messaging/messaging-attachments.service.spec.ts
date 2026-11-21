import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MessageType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { ConversationsService } from './conversations.service.js';
import { MessagingAttachmentsService } from './messaging-attachments.service.js';
import {
  MESSAGE_REPLY_SELECT,
  SIGNED_MEDIA_URL_TTL_SECONDS,
} from './messaging.constants.js';
import { MessagingGateway } from './messaging.gateway.js';

describe('MessagingAttachmentsService', () => {
  let service: MessagingAttachmentsService;
  let prisma: {
    message: {
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    conversation: {
      update: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let conversationsService: {
    validateParticipant: ReturnType<typeof vi.fn>;
  };
  let storageService: {
    uploadFile: ReturnType<typeof vi.fn>;
    getSignedUrl: ReturnType<typeof vi.fn>;
    deleteFile: ReturnType<typeof vi.fn>;
  };
  let messagingGateway: {
    emitMessageCreated: ReturnType<typeof vi.fn>;
  };

  const userAId = '11111111-1111-1111-1111-111111111111';
  const userBId = '22222222-2222-2222-2222-222222222222';
  const conversationId = '33333333-3333-3333-3333-333333333333';
  const messageId = '44444444-4444-4444-4444-444444444444';
  const mockDate = new Date('2026-10-16T12:00:00Z');

  const createMulterFile = (
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File =>
    ({
      fieldname: 'file',
      originalname: 'photo.png',
      encoding: '7bit',
      mimetype: 'image/png',
      size: 68,
      buffer: Buffer.from('fake-png-bytes'),
      destination: '',
      filename: '',
      path: '',
      stream: undefined as never,
      ...overrides,
    }) as Express.Multer.File;

  beforeEach(async () => {
    prisma = {
      message: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      conversation: {
        update: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    conversationsService = {
      validateParticipant: vi.fn().mockResolvedValue({
        id: conversationId,
        participant1Id: userAId,
        participant2Id: userBId,
      }),
    };

    storageService = {
      uploadFile: vi.fn(),
      getSignedUrl: vi.fn().mockReturnValue('https://signed.example/media'),
      deleteFile: vi.fn().mockResolvedValue(undefined),
    };

    messagingGateway = {
      emitMessageCreated: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingAttachmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConversationsService, useValue: conversationsService },
        { provide: StorageService, useValue: storageService },
        { provide: MessagingGateway, useValue: messagingGateway },
      ],
    }).compile();

    service = module.get<MessagingAttachmentsService>(
      MessagingAttachmentsService,
    );
  });

  describe('sendAttachmentMessage', () => {
    it('throws BadRequestException when file is missing', async () => {
      await expect(
        service.sendAttachmentMessage(userAId, conversationId, undefined, {}),
      ).rejects.toThrow(BadRequestException);

      expect(storageService.uploadFile).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects non-participants before checking file or uploading to storage', async () => {
      conversationsService.validateParticipant.mockRejectedValue(
        new ForbiddenException(
          'You are not a participant in this conversation',
        ),
      );

      await expect(
        service.sendAttachmentMessage(userAId, conversationId, undefined, {}),
      ).rejects.toThrow(ForbiddenException);

      expect(storageService.uploadFile).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects missing or cross-conversation replyToId before uploading', async () => {
      const replyToId = '55555555-5555-5555-5555-555555555555';
      prisma.message.findUnique.mockResolvedValue({
        id: replyToId,
        conversationId: 'other-conversation-id',
      });

      await expect(
        service.sendAttachmentMessage(
          userAId,
          conversationId,
          createMulterFile(),
          { replyToId },
        ),
      ).rejects.toThrow(NotFoundException);

      expect(storageService.uploadFile).not.toHaveBeenCalled();
    });

    it('uploads image privately, persists IMAGE message with sanitized filename, signs URL, and broadcasts via WebSocket', async () => {
      const file = createMulterFile({
        originalname: '../../secret\\vacation photo.png',
        mimetype: 'image/png',
        size: 1234,
      });
      const publicId = `daleel/conversations/${conversationId}/asset-1`;

      storageService.uploadFile.mockResolvedValue({
        publicId,
        url: 'https://cloudinary.example/raw-url',
        resourceType: 'image',
        type: 'authenticated',
        format: 'png',
        bytes: 1200,
      });

      const createdRecord = {
        id: messageId,
        conversationId,
        senderId: userAId,
        type: MessageType.IMAGE,
        content: 'Look at this!',
        mediaPublicId: publicId,
        fileName: 'vacation photo.png',
        fileSize: 1200,
        mimeType: 'image/png',
        replyToId: null,
        isEdited: false,
        deletedAt: null,
        createdAt: mockDate,
        updatedAt: mockDate,
        replyTo: null,
      };
      prisma.message.create.mockReturnValue('create-op');
      prisma.conversation.update.mockReturnValue('update-op');
      prisma.$transaction.mockResolvedValue([
        createdRecord,
        { id: conversationId },
      ]);

      const result = await service.sendAttachmentMessage(
        userAId,
        conversationId,
        file,
        { content: '  Look at this!  ' },
      );

      expect(storageService.uploadFile).toHaveBeenCalledWith(file, {
        folder: `daleel/conversations/${conversationId}`,
        type: 'authenticated',
      });
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId,
          senderId: userAId,
          type: MessageType.IMAGE,
          content: 'Look at this!',
          mediaPublicId: publicId,
          fileName: 'vacation photo.png',
          fileSize: 1200,
          mimeType: 'image/png',
          replyToId: null,
        },
        include: { replyTo: { select: MESSAGE_REPLY_SELECT } },
      });
      expect(storageService.getSignedUrl).toHaveBeenCalledWith(publicId, {
        format: 'png',
        resourceType: 'image',
        expiresIn: SIGNED_MEDIA_URL_TTL_SECONDS,
      });
      expect(result).toEqual({
        id: messageId,
        conversationId,
        senderId: userAId,
        type: MessageType.IMAGE,
        content: 'Look at this!',
        mediaUrl: 'https://signed.example/media',
        fileName: 'vacation photo.png',
        fileSize: 1200,
        mimeType: 'image/png',
        replyToId: null,
        replyTo: null,
        isEdited: false,
        isDeleted: false,
        deletedAt: null,
        createdAt: mockDate,
        updatedAt: mockDate,
      });
      expect('mediaPublicId' in result).toBe(false);
      expect(messagingGateway.emitMessageCreated).toHaveBeenCalledWith(
        conversationId,
        result,
      );
    });

    it('uploads PDF privately as DOCUMENT with empty string when caption is omitted', async () => {
      const file = createMulterFile({
        originalname: 'resume.pdf',
        mimetype: 'application/pdf',
        size: 4096,
      });
      const publicId = `daleel/conversations/${conversationId}/doc-1.pdf`;

      storageService.uploadFile.mockResolvedValue({
        publicId,
        url: 'https://cloudinary.example/raw-url.pdf',
        resourceType: 'raw',
        type: 'authenticated',
        format: 'pdf',
        bytes: 4096,
      });

      const createdRecord = {
        id: messageId,
        conversationId,
        senderId: userAId,
        type: MessageType.DOCUMENT,
        content: '',
        mediaPublicId: publicId,
        fileName: 'resume.pdf',
        fileSize: 4096,
        mimeType: 'application/pdf',
        replyToId: null,
        isEdited: false,
        deletedAt: null,
        createdAt: mockDate,
        updatedAt: mockDate,
        replyTo: null,
      };
      prisma.$transaction.mockResolvedValue([
        createdRecord,
        { id: conversationId },
      ]);

      const result = await service.sendAttachmentMessage(
        userAId,
        conversationId,
        file,
        {},
      );

      expect(result.type).toBe(MessageType.DOCUMENT);
      expect(result.content).toBe('');
      expect(result.mimeType).toBe('application/pdf');
      expect(storageService.getSignedUrl).toHaveBeenCalledWith(publicId, {
        format: 'pdf',
        resourceType: 'raw',
        expiresIn: SIGNED_MEDIA_URL_TTL_SECONDS,
      });
    });

    it('propagates StorageService validation/configuration errors without touching Prisma', async () => {
      storageService.uploadFile.mockRejectedValue(
        new ServiceUnavailableException('Cloud storage is not configured'),
      );

      await expect(
        service.sendAttachmentMessage(
          userAId,
          conversationId,
          createMulterFile(),
          {},
        ),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(messagingGateway.emitMessageCreated).not.toHaveBeenCalled();
    });

    it('performs best-effort Cloudinary cleanup and rethrows when Prisma transaction fails', async () => {
      const publicId = `daleel/conversations/${conversationId}/asset-rollback`;
      storageService.uploadFile.mockResolvedValue({
        publicId,
        url: 'https://cloudinary.example/raw-url',
        resourceType: 'image',
        type: 'authenticated',
        format: 'jpg',
        bytes: 500,
      });
      prisma.$transaction.mockRejectedValue(new Error('DB write failed'));
      storageService.deleteFile.mockRejectedValue(
        new Error('Cleanup also failed'),
      );

      await expect(
        service.sendAttachmentMessage(
          userAId,
          conversationId,
          createMulterFile({ mimetype: 'image/jpeg', originalname: 'pic.jpg' }),
          {},
        ),
      ).rejects.toThrow('DB write failed');

      expect(storageService.deleteFile).toHaveBeenCalledWith(publicId, {
        type: 'authenticated',
        resourceType: 'image',
      });
      expect(messagingGateway.emitMessageCreated).not.toHaveBeenCalled();
    });
  });

  describe('getMessageMediaUrl', () => {
    it('forbids non-participants', async () => {
      conversationsService.validateParticipant.mockRejectedValue(
        new ForbiddenException(
          'You are not a participant in this conversation',
        ),
      );

      await expect(
        service.getMessageMediaUrl(userAId, conversationId, messageId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when message does not exist or belongs to another conversation', async () => {
      prisma.message.findFirst.mockResolvedValue(null);

      await expect(
        service.getMessageMediaUrl(userAId, conversationId, messageId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when message is soft-deleted', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: messageId,
        type: MessageType.IMAGE,
        mediaPublicId: 'daleel/conversations/c/asset',
        mimeType: 'image/png',
        deletedAt: mockDate,
      });

      await expect(
        service.getMessageMediaUrl(userAId, conversationId, messageId),
      ).rejects.toThrow(NotFoundException);
      expect(storageService.getSignedUrl).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when message is a TEXT message without media', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: messageId,
        type: MessageType.TEXT,
        mediaPublicId: null,
        mimeType: null,
        deletedAt: null,
      });

      await expect(
        service.getMessageMediaUrl(userAId, conversationId, messageId),
      ).rejects.toThrow(NotFoundException);
      expect(storageService.getSignedUrl).not.toHaveBeenCalled();
    });

    it('returns fresh signed URL and TTL for an active IMAGE or DOCUMENT message', async () => {
      const pdfPublicId = `daleel/conversations/${conversationId}/doc.pdf`;
      prisma.message.findFirst.mockResolvedValue({
        id: messageId,
        type: MessageType.DOCUMENT,
        mediaPublicId: pdfPublicId,
        mimeType: 'application/pdf',
        deletedAt: null,
      });

      const result = await service.getMessageMediaUrl(
        userAId,
        conversationId,
        messageId,
      );

      expect(storageService.getSignedUrl).toHaveBeenCalledWith(pdfPublicId, {
        format: 'pdf',
        resourceType: 'raw',
        expiresIn: SIGNED_MEDIA_URL_TTL_SECONDS,
      });
      expect(result).toEqual({
        mediaUrl: 'https://signed.example/media',
        expiresIn: SIGNED_MEDIA_URL_TTL_SECONDS,
      });
    });
  });
});

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConversationsService } from './conversations.service.js';
import { MessagesService } from './messages.service.js';
import { DELETED_MESSAGE_PLACEHOLDER } from './messaging.constants.js';

describe('MessagesService', () => {
  let service: MessagesService;
  let prisma: {
    message: {
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    conversation: {
      update: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let conversationsService: {
    validateParticipant: ReturnType<typeof vi.fn>;
  };

  const userAId = '11111111-1111-1111-1111-111111111111';
  const userBId = '22222222-2222-2222-2222-222222222222';
  const conversationId = '33333333-3333-3333-3333-333333333333';
  const messageId = '44444444-4444-4444-4444-444444444444';
  const mockDate = new Date('2026-10-16T12:00:00Z');

  beforeEach(async () => {
    prisma = {
      message: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: ConversationsService,
          useValue: conversationsService,
        },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createMessage', () => {
    it('should create message and update conversation timestamp', async () => {
      const createdMsg = {
        id: messageId,
        conversationId,
        senderId: userAId,
        content: 'Test message',
        replyToId: null,
        isEdited: false,
        deletedAt: null,
        createdAt: mockDate,
        updatedAt: mockDate,
        replyTo: null,
      };

      prisma.$transaction.mockResolvedValue([
        createdMsg,
        { id: conversationId },
      ]);

      const result = await service.createMessage(userAId, {
        conversationId,
        content: 'Test message',
      });

      expect(conversationsService.validateParticipant).toHaveBeenCalledWith(
        conversationId,
        userAId,
      );
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.id).toBe(messageId);
      expect(result.content).toBe('Test message');
      expect(result.isDeleted).toBe(false);
    });

    it('should throw NotFoundException if reply target does not exist', async () => {
      const replyTargetId = '55555555-5555-5555-5555-555555555555';
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.createMessage(userAId, {
          conversationId,
          content: 'Reply message',
          replyToId: replyTargetId,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if reply target is from a different conversation', async () => {
      const replyTargetId = '55555555-5555-5555-5555-555555555555';
      prisma.message.findUnique.mockResolvedValue({
        id: replyTargetId,
        conversationId: 'different-conversation-id',
      });

      await expect(
        service.createMessage(userAId, {
          conversationId,
          content: 'Cross-chat reply',
          replyToId: replyTargetId,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('editMessage', () => {
    it('should throw NotFoundException if message does not exist', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.editMessage(userAId, {
          messageId,
          content: 'Updated content',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not the message sender', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: messageId,
        senderId: userBId, // userB is sender, userA is caller
        deletedAt: null,
      });

      await expect(
        service.editMessage(userAId, {
          messageId,
          content: 'Hacked content',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if message is already deleted', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: messageId,
        senderId: userAId,
        deletedAt: mockDate,
      });

      await expect(
        service.editMessage(userAId, {
          messageId,
          content: 'Editing tombstone',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update content and mark isEdited true', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: messageId,
        senderId: userAId,
        deletedAt: null,
      });

      const updatedMsg = {
        id: messageId,
        conversationId,
        senderId: userAId,
        content: 'New content',
        replyToId: null,
        isEdited: true,
        deletedAt: null,
        createdAt: mockDate,
        updatedAt: mockDate,
        replyTo: null,
      };

      prisma.message.update.mockResolvedValue(updatedMsg);

      const result = await service.editMessage(userAId, {
        messageId,
        content: 'New content',
      });

      expect(result.content).toBe('New content');
      expect(result.isEdited).toBe(true);
    });
  });

  describe('deleteMessage', () => {
    it('should throw NotFoundException if message does not exist', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteMessage(userAId, { messageId }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not the message sender', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: messageId,
        senderId: userBId,
        deletedAt: null,
      });

      await expect(
        service.deleteMessage(userAId, { messageId }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if message is already deleted', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: messageId,
        senderId: userAId,
        deletedAt: mockDate,
      });

      await expect(
        service.deleteMessage(userAId, { messageId }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should soft delete and mask message content in response', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: messageId,
        senderId: userAId,
        deletedAt: null,
      });

      const deletedMsg = {
        id: messageId,
        conversationId,
        senderId: userAId,
        content: 'Original text in database',
        replyToId: null,
        isEdited: false,
        deletedAt: mockDate,
        createdAt: mockDate,
        updatedAt: mockDate,
        replyTo: null,
      };

      prisma.message.update.mockResolvedValue(deletedMsg);

      const result = await service.deleteMessage(userAId, { messageId });

      expect(result.isDeleted).toBe(true);
      expect(result.content).toBe(DELETED_MESSAGE_PLACEHOLDER);
    });
  });

  describe('getConversationMessages', () => {
    it('should throw NotFoundException if cursor message does not exist in conversation', async () => {
      prisma.message.findFirst.mockResolvedValue(null);

      await expect(
        service.getConversationMessages(userAId, conversationId, {
          cursor: 'invalid-cursor',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return chronological messages with cursor and hasMore', async () => {
      const mockMessages = [
        {
          id: 'msg-3',
          conversationId,
          senderId: userAId,
          content: 'Third',
          replyToId: null,
          isEdited: false,
          deletedAt: null,
          createdAt: new Date('2026-10-16T12:03:00Z'),
          updatedAt: mockDate,
          replyTo: null,
        },
        {
          id: 'msg-2',
          conversationId,
          senderId: userBId,
          content: 'Second (deleted)',
          replyToId: null,
          isEdited: false,
          deletedAt: new Date('2026-10-16T12:02:30Z'),
          createdAt: new Date('2026-10-16T12:02:00Z'),
          updatedAt: mockDate,
          replyTo: null,
        },
        {
          id: 'msg-1',
          conversationId,
          senderId: userAId,
          content: 'First',
          replyToId: null,
          isEdited: false,
          deletedAt: null,
          createdAt: new Date('2026-10-16T12:01:00Z'),
          updatedAt: mockDate,
          replyTo: null,
        },
      ];

      // Query limit 2 -> returns 3 (so hasMore = true, batch of 2)
      prisma.message.findMany.mockResolvedValue(mockMessages);

      const result = await service.getConversationMessages(
        userAId,
        conversationId,
        { limit: 2 },
      );

      expect(result.hasMore).toBe(true);
      expect(result.items).toHaveLength(2);
      // Items are sorted chronologically ascending: msg-2 then msg-3
      expect(result.items[0].id).toBe('msg-2');
      expect(result.items[0].content).toBe(DELETED_MESSAGE_PLACEHOLDER);
      expect(result.items[1].id).toBe('msg-3');
      expect(result.nextCursor).toBe('msg-2');
    });

    it('should paginate with valid cursor', async () => {
      prisma.message.findFirst.mockResolvedValue({ id: 'msg-2' });

      const mockMessages = [
        {
          id: 'msg-1',
          conversationId,
          senderId: userAId,
          content: 'First',
          replyToId: null,
          isEdited: false,
          deletedAt: null,
          createdAt: new Date('2026-10-16T12:01:00Z'),
          updatedAt: mockDate,
          replyTo: null,
        },
      ];

      prisma.message.findMany.mockResolvedValue(mockMessages);

      const result = await service.getConversationMessages(
        userAId,
        conversationId,
        { cursor: 'msg-2', limit: 2 },
      );

      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { conversationId },
        cursor: { id: 'msg-2' },
        skip: 1,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 3,
        include: expect.any(Object),
      });

      expect(result.hasMore).toBe(false);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('msg-1');
      expect(result.nextCursor).toBeNull();
    });
  });
});

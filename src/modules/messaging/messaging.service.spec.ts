import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  DELETED_MESSAGE_PLACEHOLDER,
  MessagingService,
} from './messaging.service.js';

describe('MessagingService', () => {
  let service: MessagingService;
  let prisma: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    conversation: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    message: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  const userAId = '11111111-1111-1111-1111-111111111111';
  const userBId = '22222222-2222-2222-2222-222222222222';
  const conversationId = '33333333-3333-3333-3333-333333333333';
  const messageId = '44444444-4444-4444-4444-444444444444';
  const mockDate = new Date('2026-10-16T12:00:00Z');

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: vi.fn(),
      },
      conversation: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      message: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<MessagingService>(MessagingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCanonicalParticipants', () => {
    it('should order participants alphabetically by UUID', () => {
      const result1 = service.getCanonicalParticipants(userAId, userBId);
      const result2 = service.getCanonicalParticipants(userBId, userAId);

      expect(result1).toEqual({
        participant1Id: userAId,
        participant2Id: userBId,
      });
      expect(result2).toEqual({
        participant1Id: userAId,
        participant2Id: userBId,
      });
    });
  });

  describe('getOrCreateConversation', () => {
    it('should throw BadRequestException if starting conversation with self', async () => {
      await expect(
        service.getOrCreateConversation(userAId, userAId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if recipient does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.getOrCreateConversation(userAId, userBId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return existing conversation if found', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userBId });
      const existingConv = {
        id: conversationId,
        participant1Id: userAId,
        participant2Id: userBId,
        lastMessageAt: mockDate,
        createdAt: mockDate,
        updatedAt: mockDate,
        participant1: { id: userAId, name: 'User A', avatarUrl: null },
        participant2: { id: userBId, name: 'User B', avatarUrl: null },
        messages: [],
      };
      prisma.conversation.findUnique.mockResolvedValue(existingConv);

      const result = await service.getOrCreateConversation(userAId, userBId);

      expect(result.id).toBe(conversationId);
      expect(result.participant1Id).toBe(userAId);
      expect(result.participant2Id).toBe(userBId);
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it('should create new conversation if not found', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userBId });
      prisma.conversation.findUnique.mockResolvedValue(null);

      const newConv = {
        id: conversationId,
        participant1Id: userAId,
        participant2Id: userBId,
        lastMessageAt: null,
        createdAt: mockDate,
        updatedAt: mockDate,
        participant1: { id: userAId, name: 'User A', avatarUrl: null },
        participant2: { id: userBId, name: 'User B', avatarUrl: null },
        messages: [],
      };
      prisma.conversation.create.mockResolvedValue(newConv);

      const result = await service.getOrCreateConversation(userAId, userBId);

      expect(result.id).toBe(conversationId);
      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: {
          participant1Id: userAId,
          participant2Id: userBId,
        },
        include: expect.any(Object),
      });
    });
  });

  describe('getUserConversations', () => {
    it('should return mapped conversations with latest message', async () => {
      const mockConvs = [
        {
          id: conversationId,
          participant1Id: userAId,
          participant2Id: userBId,
          lastMessageAt: mockDate,
          createdAt: mockDate,
          updatedAt: mockDate,
          participant1: { id: userAId, name: 'User A', avatarUrl: null },
          participant2: { id: userBId, name: 'User B', avatarUrl: null },
          messages: [
            {
              id: messageId,
              conversationId,
              senderId: userAId,
              content: 'Hello World',
              replyToId: null,
              isEdited: false,
              deletedAt: null,
              createdAt: mockDate,
              updatedAt: mockDate,
              replyTo: null,
            },
          ],
        },
      ];
      prisma.conversation.findMany.mockResolvedValue(mockConvs);

      const result = await service.getUserConversations(userAId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(conversationId);
      expect(result[0].lastMessage?.content).toBe('Hello World');
    });
  });

  describe('validateParticipant', () => {
    it('should throw NotFoundException if conversation does not exist', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(
        service.validateParticipant(conversationId, userAId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not a participant', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: conversationId,
        participant1Id: userAId,
        participant2Id: userBId,
      });

      const outsiderId = '99999999-9999-9999-9999-999999999999';
      await expect(
        service.validateParticipant(conversationId, outsiderId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should succeed if user is a participant', async () => {
      const conv = {
        id: conversationId,
        participant1Id: userAId,
        participant2Id: userBId,
      };
      prisma.conversation.findUnique.mockResolvedValue(conv);

      const result = await service.validateParticipant(conversationId, userAId);
      expect(result).toEqual(conv);
    });
  });

  describe('createMessage', () => {
    it('should create message and update conversation timestamp', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: conversationId,
        participant1Id: userAId,
        participant2Id: userBId,
      });

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

      prisma.$transaction.mockResolvedValue([createdMsg, {}]);

      const result = await service.createMessage(userAId, {
        conversationId,
        content: 'Test message',
      });

      expect(result.id).toBe(messageId);
      expect(result.content).toBe('Test message');
      expect(result.isDeleted).toBe(false);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should validate replyToId exists within the same conversation', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: conversationId,
        participant1Id: userAId,
        participant2Id: userBId,
      });

      prisma.message.findUnique.mockResolvedValue({
        id: 'other-msg',
        conversationId: 'different-conversation-id',
      });

      await expect(
        service.createMessage(userAId, {
          conversationId,
          content: 'Replying to another conv',
          replyToId: 'other-msg',
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
          content: 'New content',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not the message author', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: messageId,
        senderId: userBId,
        deletedAt: null,
      });

      await expect(
        service.editMessage(userAId, {
          messageId,
          content: 'New content',
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
          content: 'New content',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update content and set isEdited to true', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: messageId,
        senderId: userAId,
        deletedAt: null,
      });

      const updatedMsg = {
        id: messageId,
        conversationId,
        senderId: userAId,
        content: 'Updated content',
        replyToId: null,
        isEdited: true,
        deletedAt: null,
        createdAt: mockDate,
        updatedAt: new Date(),
        replyTo: null,
      };

      prisma.message.update.mockResolvedValue(updatedMsg);

      const result = await service.editMessage(userAId, {
        messageId,
        content: 'Updated content',
      });

      expect(result.content).toBe('Updated content');
      expect(result.isEdited).toBe(true);
    });
  });

  describe('deleteMessage', () => {
    it('should throw ForbiddenException if user is not the sender', async () => {
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
    it('should return chronological messages with cursor and hasMore', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: conversationId,
        participant1Id: userAId,
        participant2Id: userBId,
      });

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
  });
});

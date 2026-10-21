import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConversationsService } from './conversations.service.js';

describe('ConversationsService', () => {
  let service: ConversationsService;
  let prisma: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    conversation: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
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
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<ConversationsService>(ConversationsService);
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
});

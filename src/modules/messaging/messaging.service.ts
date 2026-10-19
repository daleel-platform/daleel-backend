import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DeleteMessageDto } from './dto/delete-message.dto.js';
import { EditMessageDto } from './dto/edit-message.dto.js';
import { MessageQueryDto } from './dto/message-query.dto.js';
import {
  MessageResponseDto,
  QuotedMessageResponseDto,
} from './dto/message-response.dto.js';
import { PaginatedMessagesResponseDto } from './dto/paginated-messages-response.dto.js';
import { SendMessageDto } from './dto/send-message.dto.js';
import { ConversationResponseDto } from './dto/conversation-response.dto.js';

interface RawMessageWithReply {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  replyToId: string | null;
  isEdited: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  replyTo?: {
    id: string;
    senderId: string;
    content: string;
    deletedAt?: Date | null;
  } | null;
}

interface RawConversationWithDetails {
  id: string;
  participant1Id: string;
  participant2Id: string;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  participant1: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  participant2: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  messages: RawMessageWithReply[];
}

export const DELETED_MESSAGE_PLACEHOLDER = 'This message was deleted';

@Injectable()
export class MessagingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enforces canonical alphabetical ordering for 1-to-1 conversation participants.
   */
  getCanonicalParticipants(
    userA: string,
    userB: string,
  ): { participant1Id: string; participant2Id: string } {
    return userA < userB
      ? { participant1Id: userA, participant2Id: userB }
      : { participant1Id: userB, participant2Id: userA };
  }

  /**
   * Initiates or retrieves an existing 1-to-1 conversation between two users.
   */
  async getOrCreateConversation(
    userId: string,
    recipientId: string,
  ): Promise<ConversationResponseDto> {
    if (userId === recipientId) {
      throw new BadRequestException(
        'Cannot start a conversation with yourself',
      );
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true },
    });
    if (!recipient) {
      throw new NotFoundException('Recipient user not found');
    }

    const { participant1Id, participant2Id } = this.getCanonicalParticipants(
      userId,
      recipientId,
    );

    let conversation = await this.prisma.conversation.findUnique({
      where: {
        participant1Id_participant2Id: { participant1Id, participant2Id },
      },
      include: {
        participant1: { select: { id: true, name: true, avatarUrl: true } },
        participant2: { select: { id: true, name: true, avatarUrl: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            replyTo: {
              select: {
                id: true,
                senderId: true,
                content: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: { participant1Id, participant2Id },
        include: {
          participant1: { select: { id: true, name: true, avatarUrl: true } },
          participant2: { select: { id: true, name: true, avatarUrl: true } },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: {
              replyTo: {
                select: {
                  id: true,
                  senderId: true,
                  content: true,
                  deletedAt: true,
                },
              },
            },
          },
        },
      });
    }

    return this.mapConversation(conversation);
  }

  /**
   * Retrieves all conversations for the given user, ordered by last activity.
   */
  async getUserConversations(
    userId: string,
  ): Promise<ConversationResponseDto[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        OR: [{ participant1Id: userId }, { participant2Id: userId }],
      },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      include: {
        participant1: { select: { id: true, name: true, avatarUrl: true } },
        participant2: { select: { id: true, name: true, avatarUrl: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            replyTo: {
              select: {
                id: true,
                senderId: true,
                content: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    });

    return conversations.map((conv) => this.mapConversation(conv));
  }

  /**
   * Validates that a user is an active participant in the specified conversation.
   */
  async validateParticipant(
    conversationId: string,
    userId: string,
  ): Promise<{ id: string; participant1Id: string; participant2Id: string }> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, participant1Id: true, participant2Id: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (
      conversation.participant1Id !== userId &&
      conversation.participant2Id !== userId
    ) {
      throw new ForbiddenException(
        'You are not a participant in this conversation',
      );
    }

    return conversation;
  }

  /**
   * Creates and persists a new message (or reply), updating the conversation timestamp.
   */
  async createMessage(
    userId: string,
    dto: SendMessageDto,
  ): Promise<MessageResponseDto> {
    await this.validateParticipant(dto.conversationId, userId);

    if (dto.replyToId) {
      const replyTarget = await this.prisma.message.findUnique({
        where: { id: dto.replyToId },
        select: { id: true, conversationId: true },
      });

      if (!replyTarget || replyTarget.conversationId !== dto.conversationId) {
        throw new NotFoundException(
          'Reply target message not found in this conversation',
        );
      }
    }

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId: dto.conversationId,
          senderId: userId,
          content: dto.content,
          replyToId: dto.replyToId ?? null,
        },
        include: {
          replyTo: {
            select: {
              id: true,
              senderId: true,
              content: true,
              deletedAt: true,
            },
          },
        },
      }),
      this.prisma.conversation.update({
        where: { id: dto.conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    return this.mapMessage(message);
  }

  /**
   * Edits the text content of a message owned by the requesting user.
   */
  async editMessage(
    userId: string,
    dto: EditMessageDto,
  ): Promise<MessageResponseDto> {
    const existing = await this.prisma.message.findUnique({
      where: { id: dto.messageId },
      include: {
        replyTo: {
          select: {
            id: true,
            senderId: true,
            content: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Message not found');
    }

    if (existing.senderId !== userId) {
      throw new ForbiddenException('You can only edit your own messages');
    }

    if (existing.deletedAt !== null) {
      throw new BadRequestException('Cannot edit a deleted message');
    }

    const updated = await this.prisma.message.update({
      where: { id: dto.messageId },
      data: {
        content: dto.content,
        isEdited: true,
      },
      include: {
        replyTo: {
          select: {
            id: true,
            senderId: true,
            content: true,
            deletedAt: true,
          },
        },
      },
    });

    return this.mapMessage(updated);
  }

  /**
   * Performs a soft delete on a message owned by the requesting user.
   */
  async deleteMessage(
    userId: string,
    dto: DeleteMessageDto,
  ): Promise<MessageResponseDto> {
    const existing = await this.prisma.message.findUnique({
      where: { id: dto.messageId },
      select: { id: true, senderId: true, deletedAt: true },
    });

    if (!existing) {
      throw new NotFoundException('Message not found');
    }

    if (existing.senderId !== userId) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    if (existing.deletedAt !== null) {
      throw new BadRequestException('Message is already deleted');
    }

    const deleted = await this.prisma.message.update({
      where: { id: dto.messageId },
      data: {
        deletedAt: new Date(),
      },
      include: {
        replyTo: {
          select: {
            id: true,
            senderId: true,
            content: true,
            deletedAt: true,
          },
        },
      },
    });

    return this.mapMessage(deleted);
  }

  /**
   * Retrieves paginated historical messages using cursor-based pagination.
   */
  async getConversationMessages(
    userId: string,
    conversationId: string,
    query: MessageQueryDto,
  ): Promise<PaginatedMessagesResponseDto> {
    await this.validateParticipant(conversationId, userId);

    let beforeCreatedAt: Date | undefined;
    if (query.cursor) {
      const cursorMessage = await this.prisma.message.findUnique({
        where: { id: query.cursor },
        select: { id: true, conversationId: true, createdAt: true },
      });

      if (!cursorMessage || cursorMessage.conversationId !== conversationId) {
        throw new NotFoundException(
          'Cursor message not found in this conversation',
        );
      }

      beforeCreatedAt = cursorMessage.createdAt;
    }

    const limit = query.limit ?? 30;

    // Fetch limit + 1 to reliably determine hasMore
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(beforeCreatedAt ? { createdAt: { lt: beforeCreatedAt } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        replyTo: {
          select: {
            id: true,
            senderId: true,
            content: true,
            deletedAt: true,
          },
        },
      },
    });

    const hasMore = messages.length > limit;
    const batch = hasMore ? messages.slice(0, limit) : messages;

    // Reverse to present messages in chronological order (oldest to newest)
    const chronological = [...batch].reverse();

    // The oldest message in the returned batch serves as the nextCursor for fetching older messages
    const nextCursor = hasMore ? (chronological[0]?.id ?? null) : null;

    return {
      items: chronological.map((msg) => this.mapMessage(msg)),
      nextCursor,
      hasMore,
    };
  }

  /**
   * Serializes a database message entity into MessageResponseDto, masking soft-deleted content.
   */
  mapMessage(raw: RawMessageWithReply): MessageResponseDto {
    const isDeleted = raw.deletedAt !== null;

    let replyTo: QuotedMessageResponseDto | null = null;
    if (raw.replyTo) {
      replyTo = {
        id: raw.replyTo.id,
        senderId: raw.replyTo.senderId,
        content:
          raw.replyTo.deletedAt != null
            ? DELETED_MESSAGE_PLACEHOLDER
            : raw.replyTo.content,
      };
    }

    return {
      id: raw.id,
      conversationId: raw.conversationId,
      senderId: raw.senderId,
      content: isDeleted ? DELETED_MESSAGE_PLACEHOLDER : raw.content,
      replyToId: raw.replyToId,
      replyTo,
      isEdited: raw.isEdited,
      isDeleted,
      deletedAt: raw.deletedAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  /**
   * Serializes a conversation entity including its latest message preview.
   */
  mapConversation(raw: RawConversationWithDetails): ConversationResponseDto {
    const latestRaw = raw.messages[0] ?? null;
    const lastMessage = latestRaw ? this.mapMessage(latestRaw) : null;

    return {
      id: raw.id,
      participant1Id: raw.participant1Id,
      participant2Id: raw.participant2Id,
      participant1: raw.participant1,
      participant2: raw.participant2,
      lastMessage,
      lastMessageAt: raw.lastMessageAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }
}

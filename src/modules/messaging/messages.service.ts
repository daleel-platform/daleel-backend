import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConversationsService } from './conversations.service.js';
import { DeleteMessageDto } from './dto/delete-message.dto.js';
import { EditMessageDto } from './dto/edit-message.dto.js';
import { MessageQueryDto } from './dto/message-query.dto.js';
import { MessageResponseDto } from './dto/message-response.dto.js';
import { PaginatedMessagesResponseDto } from './dto/paginated-messages-response.dto.js';
import { SendMessageDto } from './dto/send-message.dto.js';
import {
  MESSAGE_REPLY_SELECT,
  mapMessage,
  type RawMessageWithReply,
} from './messaging.constants.js';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
  ) {}

  /**
   * Creates and persists a new message (or reply), updating the conversation timestamp.
   */
  async createMessage(
    userId: string,
    dto: SendMessageDto,
  ): Promise<MessageResponseDto> {
    await this.conversationsService.validateParticipant(
      dto.conversationId,
      userId,
    );

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
            select: MESSAGE_REPLY_SELECT,
          },
        },
      }),
      this.prisma.conversation.update({
        where: { id: dto.conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    return mapMessage(message);
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
          select: MESSAGE_REPLY_SELECT,
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
          select: MESSAGE_REPLY_SELECT,
        },
      },
    });

    return mapMessage(updated);
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
          select: MESSAGE_REPLY_SELECT,
        },
      },
    });

    return mapMessage(deleted);
  }

  /**
   * Retrieves paginated historical messages using native cursor-based pagination.
   */
  async getConversationMessages(
    userId: string,
    conversationId: string,
    query: MessageQueryDto,
  ): Promise<PaginatedMessagesResponseDto> {
    await this.conversationsService.validateParticipant(conversationId, userId);

    if (query.cursor) {
      const cursorExists = await this.prisma.message.findFirst({
        where: { id: query.cursor, conversationId },
        select: { id: true },
      });

      if (!cursorExists) {
        throw new NotFoundException(
          'Cursor message not found in this conversation',
        );
      }
    }

    const limit = query.limit ?? 30;

    // Fetch limit + 1 using native cursor pagination to reliably determine hasMore
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        replyTo: {
          select: MESSAGE_REPLY_SELECT,
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
      items: chronological.map((msg) => mapMessage(msg)),
      nextCursor,
      hasMore,
    };
  }

  /**
   * Exposes message mapping helper for callers.
   */
  mapMessage(raw: RawMessageWithReply): MessageResponseDto {
    return mapMessage(raw);
  }
}

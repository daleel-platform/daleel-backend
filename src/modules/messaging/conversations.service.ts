import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConversationResponseDto } from './dto/conversation-response.dto.js';
import {
  CONVERSATION_PARTICIPANT_SELECT,
  MESSAGE_REPLY_SELECT,
  mapMessage,
  type RawConversationWithDetails,
} from './messaging.constants.js';

@Injectable()
export class ConversationsService {
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

    const includeOptions = {
      participant1: { select: CONVERSATION_PARTICIPANT_SELECT },
      participant2: { select: CONVERSATION_PARTICIPANT_SELECT },
      messages: {
        take: 1,
        orderBy: { createdAt: 'desc' as const },
        include: {
          replyTo: {
            select: MESSAGE_REPLY_SELECT,
          },
        },
      },
    };

    let conversation = await this.prisma.conversation.findUnique({
      where: {
        participant1Id_participant2Id: { participant1Id, participant2Id },
      },
      include: includeOptions,
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: { participant1Id, participant2Id },
        include: includeOptions,
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
        participant1: { select: CONVERSATION_PARTICIPANT_SELECT },
        participant2: { select: CONVERSATION_PARTICIPANT_SELECT },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            replyTo: {
              select: MESSAGE_REPLY_SELECT,
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
   * Serializes a conversation entity including its latest message preview.
   */
  mapConversation(raw: RawConversationWithDetails): ConversationResponseDto {
    const latestRaw = raw.messages[0] ?? null;
    const lastMessage = latestRaw ? mapMessage(latestRaw) : null;

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

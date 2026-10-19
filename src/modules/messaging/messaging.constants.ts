import {
  MessageResponseDto,
  QuotedMessageResponseDto,
} from './dto/message-response.dto.js';

export const DELETED_MESSAGE_PLACEHOLDER = 'This message was deleted';

export const MESSAGE_REPLY_SELECT = {
  id: true,
  senderId: true,
  content: true,
  deletedAt: true,
} as const;

export const CONVERSATION_PARTICIPANT_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
} as const;

export interface RawMessageWithReply {
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

export interface RawConversationWithDetails {
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

/**
 * Serializes a database message entity into MessageResponseDto, masking soft-deleted content.
 */
export function mapMessage(raw: RawMessageWithReply): MessageResponseDto {
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

import { MessageType } from '@prisma/client';
import type { StorageService } from '../storage/storage.service.js';
import type { ResourceType } from '../storage/storage.types.js';
import {
  MessageResponseDto,
  QuotedMessageResponseDto,
} from './dto/message-response.dto.js';

export const DELETED_MESSAGE_PLACEHOLDER = 'This message was deleted';

export const SIGNED_MEDIA_URL_TTL_SECONDS = 3600;

export interface MediaStorageMetadata {
  readonly format: string;
  readonly resourceType: ResourceType;
}

export const MEDIA_MIME_TO_STORAGE: Readonly<
  Record<string, MediaStorageMetadata>
> = {
  'image/jpeg': { format: 'jpg', resourceType: 'image' },
  'image/png': { format: 'png', resourceType: 'image' },
  'image/webp': { format: 'webp', resourceType: 'image' },
  'application/pdf': { format: 'pdf', resourceType: 'raw' },
};

export const FORMAT_TO_MIME: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

export function resolveMediaStorageMetadata(
  mimeType: string | null,
): MediaStorageMetadata | null {
  if (!mimeType) {
    return null;
  }
  return MEDIA_MIME_TO_STORAGE[mimeType.toLowerCase()] ?? null;
}

export function createMediaUrlSigner(
  storageService: Pick<StorageService, 'getSignedUrl'>,
): (publicId: string, mimeType: string) => string | null {
  return (publicId: string, mimeType: string): string | null => {
    const metadata = resolveMediaStorageMetadata(mimeType);
    if (!metadata) {
      return null;
    }
    return storageService.getSignedUrl(publicId, {
      format: metadata.format,
      resourceType: metadata.resourceType,
      expiresIn: SIGNED_MEDIA_URL_TTL_SECONDS,
    });
  };
}

export function sanitizeFileName(
  originalName: string | undefined,
  fallbackFormat: string,
): string {
  const fallback = `attachment.${fallbackFormat}`;
  if (!originalName) {
    return fallback;
  }

  const rawBaseName = originalName.split(/[/\\]/).pop() ?? '';
  let cleaned = '';
  for (let i = 0; i < rawBaseName.length; i += 1) {
    const code = rawBaseName.charCodeAt(i);
    if (code >= 0x20 && code !== 0x7f) {
      cleaned += rawBaseName[i];
    }
  }
  const baseName = cleaned.trim();

  if (!baseName || baseName === '.' || baseName === '..') {
    return fallback;
  }

  if (baseName.length <= 255) {
    return baseName;
  }

  const dotIndex = baseName.lastIndexOf('.');
  if (dotIndex > 0 && dotIndex < baseName.length - 1) {
    const ext = baseName.slice(dotIndex);
    if (ext.length < 255) {
      return `${baseName.slice(0, 255 - ext.length)}${ext}`;
    }
  }

  return baseName.slice(0, 255);
}

export const MESSAGE_REPLY_SELECT = {
  id: true,
  senderId: true,
  type: true,
  content: true,
  fileName: true,
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
  type: MessageType;
  content: string;
  mediaPublicId: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  replyToId: string | null;
  isEdited: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  replyTo?: {
    id: string;
    senderId: string;
    type: MessageType;
    content: string;
    fileName: string | null;
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
 * Serializes a database message entity into MessageResponseDto, masking soft-deleted content
 * and signing active media attachments without exposing internal storage identifiers.
 */
export function mapMessage(
  raw: RawMessageWithReply,
  signUrl?: (publicId: string, mimeType: string) => string | null,
): MessageResponseDto {
  const isDeleted = raw.deletedAt !== null;

  let replyTo: QuotedMessageResponseDto | null = null;
  if (raw.replyTo) {
    const replyDeleted = raw.replyTo.deletedAt != null;
    replyTo = {
      id: raw.replyTo.id,
      senderId: raw.replyTo.senderId,
      type: raw.replyTo.type,
      content: replyDeleted ? DELETED_MESSAGE_PLACEHOLDER : raw.replyTo.content,
      fileName: replyDeleted ? null : raw.replyTo.fileName,
    };
  }

  const hasMedia =
    !isDeleted && raw.mediaPublicId !== null && raw.mimeType !== null;
  const mediaUrl =
    !isDeleted && raw.mediaPublicId !== null && raw.mimeType !== null && signUrl
      ? signUrl(raw.mediaPublicId, raw.mimeType)
      : null;

  return {
    id: raw.id,
    conversationId: raw.conversationId,
    senderId: raw.senderId,
    type: raw.type,
    content: isDeleted ? DELETED_MESSAGE_PLACEHOLDER : raw.content,
    mediaUrl,
    fileName: hasMedia ? raw.fileName : null,
    fileSize: hasMedia ? raw.fileSize : null,
    mimeType: hasMedia ? raw.mimeType : null,
    replyToId: raw.replyToId,
    replyTo,
    isEdited: raw.isEdited,
    isDeleted,
    deletedAt: raw.deletedAt,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

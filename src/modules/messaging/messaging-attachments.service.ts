import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MessageType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { ConversationsService } from './conversations.service.js';
import { CreateAttachmentMessageDto } from './dto/create-attachment-message.dto.js';
import { MediaUrlResponseDto } from './dto/media-url-response.dto.js';
import { MessageResponseDto } from './dto/message-response.dto.js';
import {
  FORMAT_TO_MIME,
  MESSAGE_REPLY_SELECT,
  SIGNED_MEDIA_URL_TTL_SECONDS,
  createMediaUrlSigner,
  mapMessage,
  sanitizeFileName,
} from './messaging.constants.js';
import { MessagingGateway } from './messaging.gateway.js';

@Injectable()
export class MessagingAttachmentsService {
  private readonly logger = new Logger(MessagingAttachmentsService.name);
  private readonly signMediaUrl: (
    publicId: string,
    mimeType: string,
  ) => string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
    private readonly storageService: StorageService,
    private readonly messagingGateway: MessagingGateway,
  ) {
    this.signMediaUrl = createMediaUrlSigner(this.storageService);
  }

  /**
   * Validates participant access, uploads a private attachment to Cloudinary,
   * persists the message in PostgreSQL, and broadcasts it to the conversation room.
   */
  async sendAttachmentMessage(
    userId: string,
    conversationId: string,
    file: Express.Multer.File | undefined,
    dto: CreateAttachmentMessageDto,
  ): Promise<MessageResponseDto> {
    await this.conversationsService.validateParticipant(conversationId, userId);

    if (!file) {
      throw new BadRequestException('An attachment file is required');
    }

    if (dto.replyToId) {
      const replyTarget = await this.prisma.message.findUnique({
        where: { id: dto.replyToId },
        select: { id: true, conversationId: true },
      });

      if (!replyTarget || replyTarget.conversationId !== conversationId) {
        throw new NotFoundException(
          'Reply target message not found in this conversation',
        );
      }
    }

    const upload = await this.storageService.uploadFile(file, {
      folder: `daleel/conversations/${conversationId}`,
      type: 'authenticated',
    });

    const messageType =
      upload.resourceType === 'image'
        ? MessageType.IMAGE
        : MessageType.DOCUMENT;
    const mimeType =
      FORMAT_TO_MIME[upload.format.toLowerCase()] ?? file.mimetype;
    const fileName = sanitizeFileName(file.originalname, upload.format);
    const content = dto.content?.trim() ?? '';

    let message;
    try {
      [message] = await this.prisma.$transaction([
        this.prisma.message.create({
          data: {
            conversationId,
            senderId: userId,
            type: messageType,
            content,
            mediaPublicId: upload.publicId,
            fileName,
            fileSize: upload.bytes,
            mimeType,
            replyToId: dto.replyToId ?? null,
          },
          include: {
            replyTo: {
              select: MESSAGE_REPLY_SELECT,
            },
          },
        }),
        this.prisma.conversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: new Date() },
        }),
      ]);
    } catch (error) {
      try {
        await this.storageService.deleteFile(upload.publicId, {
          type: 'authenticated',
          resourceType: upload.resourceType,
        });
      } catch (cleanupError) {
        this.logger.warn(
          `Best-effort upload rollback failed for ${upload.publicId}: ${
            cleanupError instanceof Error
              ? cleanupError.message
              : 'Unknown error'
          }`,
        );
      }
      throw error;
    }

    const response = mapMessage(message, this.signMediaUrl);
    this.messagingGateway.emitMessageCreated(conversationId, response);
    return response;
  }

  /**
   * Generates a fresh time-limited signed URL for an active media message.
   */
  async getMessageMediaUrl(
    userId: string,
    conversationId: string,
    messageId: string,
  ): Promise<MediaUrlResponseDto> {
    await this.conversationsService.validateParticipant(conversationId, userId);

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
      select: {
        id: true,
        mediaPublicId: true,
        mimeType: true,
        deletedAt: true,
      },
    });

    if (
      !message ||
      message.deletedAt !== null ||
      !message.mediaPublicId ||
      !message.mimeType
    ) {
      throw new NotFoundException('Media attachment not found');
    }

    const mediaUrl = this.signMediaUrl(message.mediaPublicId, message.mimeType);
    if (!mediaUrl) {
      throw new NotFoundException('Media attachment not found');
    }

    return {
      mediaUrl,
      expiresIn: SIGNED_MEDIA_URL_TTL_SECONDS,
    };
  }
}

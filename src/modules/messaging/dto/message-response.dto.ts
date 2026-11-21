import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageType } from '@prisma/client';
import { Expose, Type } from 'class-transformer';

export class QuotedMessageResponseDto {
  @ApiProperty({ description: 'Quoted message UUID' })
  @Expose()
  id!: string;

  @ApiProperty({ description: 'Sender UUID of the quoted message' })
  @Expose()
  senderId!: string;

  @ApiProperty({
    description: 'Message type of the quoted message',
    enum: MessageType,
  })
  @Expose()
  type!: MessageType;

  @ApiProperty({ description: 'Content preview of the quoted message' })
  @Expose()
  content!: string;

  @ApiPropertyOptional({
    description: 'Original filename if the quoted message has an attachment',
    nullable: true,
  })
  @Expose()
  fileName!: string | null;
}

export class MessageResponseDto {
  @ApiProperty({ description: 'Message unique identifier' })
  @Expose()
  id!: string;

  @ApiProperty({ description: 'Conversation unique identifier' })
  @Expose()
  conversationId!: string;

  @ApiProperty({ description: 'Sender unique identifier' })
  @Expose()
  senderId!: string;

  @ApiProperty({
    description: 'Message type',
    enum: MessageType,
  })
  @Expose()
  type!: MessageType;

  @ApiProperty({ description: 'Text content or caption of the message' })
  @Expose()
  content!: string;

  @ApiPropertyOptional({
    description: 'Time-limited signed URL for media attachments',
    nullable: true,
  })
  @Expose()
  mediaUrl!: string | null;

  @ApiPropertyOptional({
    description: 'Original sanitized filename of the attachment',
    nullable: true,
  })
  @Expose()
  fileName!: string | null;

  @ApiPropertyOptional({
    description: 'Attachment file size in bytes',
    nullable: true,
  })
  @Expose()
  fileSize!: number | null;

  @ApiPropertyOptional({
    description: 'Validated MIME type of the attachment',
    nullable: true,
  })
  @Expose()
  mimeType!: string | null;

  @ApiPropertyOptional({
    description: 'Parent message UUID being replied to',
    nullable: true,
  })
  @Expose()
  replyToId!: string | null;

  @ApiPropertyOptional({
    description: 'Quoted parent message snapshot',
    type: () => QuotedMessageResponseDto,
    nullable: true,
  })
  @Expose()
  @Type(() => QuotedMessageResponseDto)
  replyTo!: QuotedMessageResponseDto | null;

  @ApiProperty({ description: 'Whether the message has been edited' })
  @Expose()
  isEdited!: boolean;

  @ApiProperty({ description: 'Whether the message has been soft-deleted' })
  @Expose()
  isDeleted!: boolean;

  @ApiPropertyOptional({
    description: 'Timestamp when the message was deleted',
    nullable: true,
  })
  @Expose()
  deletedAt!: Date | null;

  @ApiProperty({ description: 'Message creation timestamp' })
  @Expose()
  createdAt!: Date;

  @ApiProperty({ description: 'Message last update timestamp' })
  @Expose()
  updatedAt!: Date;
}

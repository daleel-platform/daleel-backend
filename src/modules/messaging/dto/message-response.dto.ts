import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class QuotedMessageResponseDto {
  @ApiProperty({ description: 'Quoted message UUID' })
  @Expose()
  id!: string;

  @ApiProperty({ description: 'Sender UUID of the quoted message' })
  @Expose()
  senderId!: string;

  @ApiProperty({ description: 'Content preview of the quoted message' })
  @Expose()
  content!: string;
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

  @ApiProperty({ description: 'Text content of the message' })
  @Expose()
  content!: string;

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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { MessageResponseDto } from './message-response.dto.js';
import { UserSummaryResponseDto } from './user-summary-response.dto.js';

export class ConversationResponseDto {
  @ApiProperty({ description: 'Conversation unique identifier' })
  @Expose()
  id!: string;

  @ApiProperty({ description: 'Participant 1 UUID' })
  @Expose()
  participant1Id!: string;

  @ApiProperty({ description: 'Participant 2 UUID' })
  @Expose()
  participant2Id!: string;

  @ApiProperty({
    description: 'Participant 1 details',
    type: () => UserSummaryResponseDto,
  })
  @Expose()
  @Type(() => UserSummaryResponseDto)
  participant1!: UserSummaryResponseDto;

  @ApiProperty({
    description: 'Participant 2 details',
    type: () => UserSummaryResponseDto,
  })
  @Expose()
  @Type(() => UserSummaryResponseDto)
  participant2!: UserSummaryResponseDto;

  @ApiPropertyOptional({
    description: 'Latest message in the conversation',
    type: () => MessageResponseDto,
    nullable: true,
  })
  @Expose()
  @Type(() => MessageResponseDto)
  lastMessage!: MessageResponseDto | null;

  @ApiPropertyOptional({
    description: 'Timestamp of the latest message',
    nullable: true,
  })
  @Expose()
  lastMessageAt!: Date | null;

  @ApiProperty({ description: 'Conversation creation timestamp' })
  @Expose()
  createdAt!: Date;

  @ApiProperty({ description: 'Conversation last update timestamp' })
  @Expose()
  updatedAt!: Date;
}

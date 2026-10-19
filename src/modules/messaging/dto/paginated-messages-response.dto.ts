import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { MessageResponseDto } from './message-response.dto.js';

export class PaginatedMessagesResponseDto {
  @ApiProperty({
    description: 'Array of messages in chronological order',
    type: [MessageResponseDto],
  })
  @Expose()
  @Type(() => MessageResponseDto)
  items!: MessageResponseDto[];

  @ApiPropertyOptional({
    description: 'Cursor ID to fetch messages prior to this batch',
    nullable: true,
  })
  @Expose()
  nextCursor!: string | null;

  @ApiProperty({
    description: 'Whether there are more historical messages available',
  })
  @Expose()
  hasMore!: boolean;
}

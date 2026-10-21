import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ description: 'Conversation UUID' })
  @IsUUID()
  @IsNotEmpty()
  conversationId!: string;

  @ApiProperty({ description: 'Text content of the message', maxLength: 5000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;

  @ApiPropertyOptional({
    description: 'Optional parent message UUID being replied to',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  replyToId?: string;
}

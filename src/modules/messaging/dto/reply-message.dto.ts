import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class ReplyMessageDto {
  @ApiProperty({ description: 'Conversation UUID' })
  @IsUUID()
  @IsNotEmpty()
  conversationId!: string;

  @ApiProperty({ description: 'Text content of the reply', maxLength: 5000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;

  @ApiProperty({ description: 'Parent message UUID being replied to' })
  @IsUUID()
  @IsNotEmpty()
  replyToId!: string;
}
